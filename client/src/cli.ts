// toll client. Every command reads and writes client/state/<cluster>.json.
//
//   npm run toll -- setup [--grace <slots>]
//   npm run toll -- launch <n1> <n2> <n3> <target> --name <name> --symbol <symbol> [--uri <uri>]
//                      [--pool <pool> --base <mint>]   resume after the pool was created
//   npm run toll -- buy <problem> <quote amount>
//   npm run toll -- sweep <problem>
//   npm run toll -- solve <problem> <fmm scheme.json> [--budget <units>]
//   npm run toll -- claim <problem>
//   npm run toll -- close <problem>
//   npm run toll -- status [problem]
//
// <problem> is the record key `launch` prints, such as 7x7x9r314.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import BN from 'bn.js'
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    getAssociatedTokenAddressSync,
    NATIVE_MINT,
} from '@solana/spl-token'
import { deriveDbcPoolAddress, DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
    CLUSTER,
    connection,
    explorer,
    loadKeypair,
    loadState,
    type ProblemRecord,
    ROOT,
    saveState,
    send,
    sendTx,
    waitForSlot,
} from './env.js'
import { launchParams, type Profile } from './params.js'
import { commitment, encodeScheme, type FmmScheme, schemeHeader } from '@meteortoll/core'
import {
    attemptAddress,
    dbcEventAuthority,
    dbcPoolAuthority,
    DBC,
    fetchAttempt,
    fetchProblem,
    launchpadAddress,
    problemAddress,
    SLOT_HASHES,
    statusName,
    submissionCreate,
    TOKEN_PROGRAM_ID,
    tollProgram,
    vaultAddress,
} from './toll.js'

const wallet = loadKeypair()
const toll = tollProgram(wallet)
const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
const methods = toll.methods as never as Record<string, (...args: unknown[]) => {
    accountsPartial(accounts: Record<string, PublicKey>): { instruction(): Promise<import('@solana/web3.js').TransactionInstruction> }
}>

function flag(args: string[], name: string, fallback?: string): string {
    const at = args.indexOf(`--${name}`)
    if (at >= 0 && args[at + 1]) return args[at + 1]
    if (fallback !== undefined) return fallback
    throw new Error(`missing --${name}`)
}

function record(key: string): ProblemRecord {
    const found = loadState().problems[key]
    if (!found) throw new Error(`no problem ${key} in client/state/${CLUSTER}.json`)
    return found
}

const SOL = (lamports: number | bigint) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6)

async function tokenBalance(account: PublicKey): Promise<bigint> {
    const info = await connection.getTokenAccountBalance(account).catch(() => null)
    return info ? BigInt(info.value.amount) : 0n
}

async function setup(args: string[]) {
    const state = loadState()
    if (state.config && state.launchpad) {
        console.log(`already set up: config ${state.config}, launchpad ${state.launchpad}`)
        return
    }
    const grace = Number(flag(args, 'grace', CLUSTER === 'mainnet' ? '9000' : '150'))
    const config = Keypair.generate()
    const params = launchParams((CLUSTER === 'mainnet' ? 'mainnet' : 'devnet') as Profile)
    const create = await dbc.partner.createConfig({
        ...params,
        config: config.publicKey,
        feeClaimer: wallet.publicKey,
        leftoverReceiver: wallet.publicKey,
        quoteMint: NATIVE_MINT,
        payer: wallet.publicKey,
    })
    console.log(`create DBC config ${config.publicKey.toBase58()}: ${explorer(await sendTx(create, wallet, [config]))}`)

    const launchpad = launchpadAddress(wallet.publicKey)
    const init = await methods
        .initLaunchpad(config.publicKey, new BN(grace))
        .accountsPartial({ admin: wallet.publicKey, launchpad })
        .instruction()
    console.log(`init launchpad ${launchpad.toBase58()} (grace ${grace} slots): ${explorer(await send([init], wallet))}`)
    saveState({ ...state, config: config.publicKey.toBase58(), launchpad: launchpad.toBase58() })
}

async function launch(args: string[]) {
    const [n1, n2, n3, target] = args.slice(0, 4).map(Number)
    const name = flag(args, 'name')
    const symbol = flag(args, 'symbol')
    const uri = flag(args, 'uri', `https://meteortoll.invalid/${n1}x${n2}x${n3}r${target}.json`)
    const state = loadState()
    if (!state.config || !state.launchpad) throw new Error('run setup first')
    const config = new PublicKey(state.config)
    const resumePool = flag(args, 'pool', '')
    const base = resumePool ? null : Keypair.generate()
    const baseMint = base ? base.publicKey : new PublicKey(flag(args, 'base'))
    const pool = deriveDbcPoolAddress(NATIVE_MINT, baseMint, config)
    if (resumePool && !pool.equals(new PublicKey(resumePool))) throw new Error('--pool does not match --base and the config')
    const problem = problemAddress(pool, [n1, n2, n3], target)

    if (base) {
        const create = await dbc.creator.createPool({
            name,
            symbol,
            uri,
            payer: wallet.publicKey,
            poolCreator: wallet.publicKey,
            config,
            baseMint,
        })
        console.log(`create pool ${pool.toBase58()} (base ${baseMint.toBase58()}): ${explorer(await sendTx(create, wallet, [base]))}`)
    }

    const handOver = await dbc.creator.transferPoolCreator({ pool, creator: wallet.publicKey, newCreator: problem })
    const register = await methods
        .registerProblem(n1, n2, n3, target)
        .accountsPartial({
            payer: wallet.publicKey,
            launchpad: new PublicKey(state.launchpad),
            config,
            pool,
            problem,
            baseMint,
            quoteMint: NATIVE_MINT,
            baseVault: vaultAddress(problem, baseMint),
            quoteVault: vaultAddress(problem, NATIVE_MINT),
            baseTokenProgram: TOKEN_PROGRAM_ID,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
    handOver.add(register)
    console.log(`hand pool to problem ${problem.toBase58()} and register: ${explorer(await sendTx(handOver, wallet))}`)

    const statementKey = `${n1}x${n2}x${n3}r${target}`
    const key = state.problems[statementKey] && state.problems[statementKey].problem !== problem.toBase58() ? `${statementKey}-${symbol}` : statementKey
    state.problems[key] = {
        problem: problem.toBase58(),
        pool: pool.toBase58(),
        baseMint: baseMint.toBase58(),
        statement: [n1, n2, n3, target],
        name,
        symbol,
    }
    saveState(state)
    console.log(`launched ${key}`)
}

async function buy(args: string[]) {
    const found = record(args[0])
    const lamports = Math.round(Number(args[1]) * LAMPORTS_PER_SOL)
    const swap = await dbc.pool.swap({
        owner: wallet.publicKey,
        pool: new PublicKey(found.pool),
        amountIn: new BN(lamports),
        minimumAmountOut: new BN(0),
        swapBaseForQuote: false,
        referralTokenAccount: null,
    })
    console.log(`buy ${args[1]} SOL of ${found.symbol}: ${explorer(await sendTx(swap, wallet))}`)
}

async function sweep(args: string[]) {
    const found = record(args[0])
    const problem = new PublicKey(found.problem)
    const account = await fetchProblem(toll, problem)
    const pool = await dbc.state.getPool(new PublicKey(found.pool))
    if (!pool) throw new Error('pool not found')
    const state = pool.poolState ?? (pool as never)
    const before = await tokenBalance(account.quoteVault)

    const fees = await methods
        .sweepTradingFees()
        .accountsPartial({
            problem,
            pool: new PublicKey(found.pool),
            poolAuthority: dbcPoolAuthority,
            baseVault: account.baseVault,
            quoteVault: account.quoteVault,
            poolBaseVault: state.baseVault,
            poolQuoteVault: state.quoteVault,
            baseMint: account.baseMint,
            quoteMint: account.quoteMint,
            baseTokenProgram: TOKEN_PROGRAM_ID,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
            eventAuthority: dbcEventAuthority,
            dbcProgram: DBC,
        })
        .instruction()
    console.log(`sweep trading fees: ${explorer(await send([fees], wallet))}`)

    const config = await dbc.state.getPoolConfig(state.config)
    if (config && BigInt(state.quoteReserve.toString()) >= BigInt(config.migrationQuoteThreshold.toString()) && !state.isCreatorWithdrawSurplus) {
        const surplus = await methods
            .sweepSurplus()
            .accountsPartial({
                problem,
                pool: new PublicKey(found.pool),
                config: state.config,
                poolAuthority: dbcPoolAuthority,
                quoteVault: account.quoteVault,
                poolQuoteVault: state.quoteVault,
                quoteMint: account.quoteMint,
                quoteTokenProgram: TOKEN_PROGRAM_ID,
                eventAuthority: dbcEventAuthority,
                dbcProgram: DBC,
            })
            .instruction()
        console.log(`sweep surplus: ${explorer(await send([surplus], wallet))}`)
    }
    const after = await tokenBalance(account.quoteVault)
    console.log(`bounty ${SOL(after)} SOL (+${SOL(after - before)})`)
}

function saltPath(attempt: PublicKey) {
    return resolve(ROOT, `client/state/salts/${attempt.toBase58()}.json`)
}

async function solve(args: string[]) {
    const found = record(args[0])
    const problem = new PublicKey(found.problem)
    const scheme = encodeScheme(JSON.parse(readFileSync(args[1], 'utf8')) as FmmScheme)
    const budget = Number(flag(args, 'budget', '10000'))
    const header = schemeHeader(scheme)
    const [n1, n2, n3, target] = found.statement
    if (header.n1 !== n1 || header.n2 !== n2 || header.n3 !== n3 || header.rank > target) {
        throw new Error(`scheme is ${header.n1}x${header.n2}x${header.n3} rank ${header.rank}; problem wants ${n1}x${n2}x${n3} rank <= ${target}`)
    }
    const attempt = attemptAddress(problem, wallet.publicKey)
    const saltFile = saltPath(attempt)
    let current = await fetchAttempt(toll, attempt)

    if (!current) {
        const salt = randomBytes(32)
        mkdirSync(resolve(saltFile, '..'), { recursive: true })
        writeFileSync(saltFile, JSON.stringify({ salt: salt.toString('hex') }))
        const commit = await methods
            .commit([...commitment(problem, wallet.publicKey, salt, scheme)])
            .accountsPartial({ solver: wallet.publicKey, problem, attempt })
            .instruction()
        console.log(`commit (bond staked): ${explorer(await send([commit], wallet))}`)
        current = await fetchAttempt(toll, attempt)
    }
    if (!current) throw new Error('attempt missing after commit')
    if (!existsSync(saltFile)) throw new Error(`salt for ${attempt.toBase58()} is not in ${saltFile}`)
    const salt = Buffer.from(JSON.parse(readFileSync(saltFile, 'utf8')).salt, 'hex')
    const committedSlot = current.committedSlot.toNumber()

    if (statusName(current.status) === 'committed') {
        // Upload only once a later slot exists, so no copier can commit in the author's slot.
        await waitForSlot(committedSlot + 1)
        let submission = current.submission
        if (submission.equals(PublicKey.default)) {
            const buffer = Keypair.generate()
            const rent = await connection.getMinimumBalanceForRentExemption(44 + scheme.length)
            const open = await methods
                .openSubmission(scheme.length)
                .accountsPartial({ solver: wallet.publicKey, attempt, submission: buffer.publicKey })
                .instruction()
            const create = submissionCreate(wallet.publicKey, buffer.publicKey, scheme.length, rent)
            console.log(`open submission ${buffer.publicKey.toBase58()} (${scheme.length} bytes): ${explorer(await send([create, open], wallet, [buffer]))}`)
            submission = buffer.publicKey
        }
        const chunk = 900
        const written = (await connection.getAccountInfo(submission))?.data.subarray(44) ?? Buffer.alloc(0)
        const offsets = Array.from({ length: Math.ceil(scheme.length / chunk) }, (_, i) => i * chunk).filter(
            (offset) => !scheme.subarray(offset, offset + chunk).equals(written.subarray(offset, offset + chunk))
        )
        console.log(`${offsets.length} of ${Math.ceil(scheme.length / chunk)} chunks left to upload`)
        const parallel = Number(process.env.TOLL_UPLOAD_PARALLEL ?? '2')
        for (let i = 0; i < offsets.length; i += parallel) {
            await Promise.all(
                offsets.slice(i, i + parallel).map(async (offset) => {
                    const write = await methods
                        .writeSubmission(offset, scheme.subarray(offset, offset + chunk))
                        .accountsPartial({ solver: wallet.publicKey, attempt, submission })
                        .instruction()
                    await send([write], wallet)
                })
            )
            console.log(`uploaded ${Math.min(i + parallel, offsets.length)}/${offsets.length} chunks`)
            await new Promise((done) => setTimeout(done, 300))
        }
        await waitForSlot(committedSlot + 2)
        const reveal = await methods
            .reveal([...salt])
            .accountsPartial({ solver: wallet.publicKey, problem, attempt, submission, slotHashes: SLOT_HASHES })
            .instruction()
        console.log(`reveal: ${explorer(await send([reveal], wallet, [], 400_000))}`)
        current = await fetchAttempt(toll, attempt)
    }

    while (current && statusName(current.status) === 'revealed') {
        const verify = await methods
            .verify(budget)
            .accountsPartial({ cranker: wallet.publicKey, problem, attempt, submission: current.submission })
            .instruction()
        console.log(`verify: ${explorer(await send([verify], wallet, [], 1_400_000))}`)
        current = await fetchAttempt(toll, attempt)
    }
    const solved = await fetchProblem(toll, problem)
    console.log(`attempt ${statusName(current!.status)}; problem solver ${solved.solver?.toBase58() ?? 'none'}`)
}

async function claim(args: string[]) {
    const found = record(args[0])
    const problem = new PublicKey(found.problem)
    const account = await fetchProblem(toll, problem)
    const solverBase = getAssociatedTokenAddressSync(account.baseMint, wallet.publicKey)
    const solverQuote = getAssociatedTokenAddressSync(account.quoteMint, wallet.publicKey)
    const instructions = [
        createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, solverBase, wallet.publicKey, account.baseMint),
        createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, solverQuote, wallet.publicKey, account.quoteMint),
        await methods
            .claim()
            .accountsPartial({
                solver: wallet.publicKey,
                problem,
                baseVault: account.baseVault,
                quoteVault: account.quoteVault,
                solverBase,
                solverQuote,
                baseMint: account.baseMint,
                quoteMint: account.quoteMint,
                baseTokenProgram: TOKEN_PROGRAM_ID,
                quoteTokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction(),
    ]
    const won = await tokenBalance(account.quoteVault)
    if (account.quoteMint.equals(NATIVE_MINT)) {
        instructions.push(createCloseAccountInstruction(solverQuote, wallet.publicKey, wallet.publicKey))
    }
    console.log(`claim ${SOL(won)} SOL bounty: ${explorer(await send(instructions, wallet))}`)
}

async function close(args: string[]) {
    const found = record(args[0])
    const problem = new PublicKey(found.problem)
    const attempt = attemptAddress(problem, wallet.publicKey)
    const current = await fetchAttempt(toll, attempt)
    if (!current) throw new Error('no attempt to close')
    const instruction = await methods
        .closeAttempt()
        .accountsPartial({
            solver: wallet.publicKey,
            problem,
            attempt,
            submission: current.submission.equals(PublicKey.default) ? wallet.publicKey : current.submission,
        })
        .instruction()
    console.log(`close attempt: ${explorer(await send([instruction], wallet))}`)
}

async function status(args: string[]) {
    const state = loadState()
    console.log(`cluster ${CLUSTER}, wallet ${wallet.publicKey.toBase58()}, ${SOL(await connection.getBalance(wallet.publicKey))} SOL`)
    console.log(`config ${state.config ?? '-'}, launchpad ${state.launchpad ?? '-'}`)
    const keys = args[0] ? [args[0]] : Object.keys(state.problems)
    const slot = await connection.getSlot('confirmed')
    for (const key of keys) {
        const found = record(key)
        const account = await fetchProblem(toll, new PublicKey(found.problem))
        const pool = await dbc.state.getPool(new PublicKey(found.pool))
        const poolState = pool?.poolState ?? (pool as never)
        const owed = poolState ? BigInt(poolState.creatorQuoteFee.toString()) : 0n
        const final = account.solver !== null && slot >= account.solvedAtSlot.toNumber() + account.graceSlots.toNumber()
        console.log(
            `${key} ${found.symbol}: bounty ${SOL(await tokenBalance(account.quoteVault))} SOL, unswept ${SOL(owed)} SOL, ` +
                `attempts ${account.attempts}, solver ${account.solver?.toBase58() ?? 'none'}${account.solver ? (final ? ' (final)' : ' (in grace)') : ''}`
        )
    }
}

const commands: Record<string, (args: string[]) => Promise<void>> = { setup, launch, buy, sweep, solve, claim, close, status }
const [command, ...rest] = process.argv.slice(2)
if (!commands[command]) {
    console.error(`commands: ${Object.keys(commands).join(', ')}`)
    process.exit(2)
}
await commands[command](rest)
