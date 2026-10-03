import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import BN from 'bn.js'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    getAssociatedTokenAddressSync,
    NATIVE_MINT,
} from '@solana/spl-token'
import { createDbcProgram, deriveDbcPoolAddress, DynamicBondingCurveClient, PROTOCOL_POOL_CREATION_FEE_PERCENT, U64_MAX } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
    CLUSTER,
    connection,
    PROFILE,
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
import { readScheme } from './schemeFile.js'
import type { Economics } from '@meteortoll/core'
import {
    assertCluster,
    BPF_LOADER_UPGRADEABLE,
    clusterOf,
    clusterProblem,
    deployCost,
    launchLamports,
    MAX_GRACE_SLOTS,
    MIN_GRACE_SLOTS,
    profileProblem,
    programDataMatches,
    SETUP_LAMPORTS,
    sha256,
    siteProblem,
    statementProblem,
    upgradeAuthority,
} from './preflight.js'
import { metadataUri, SITE_URL } from './site.js'
import { buyTransaction, MAX_FEE_PERCENT, parseLimits, SLIPPAGE_BPS } from './trade.js'
import { knownFormat, targetProblem } from '../../app/src/lib/known.js'
import { commitment, KIND_MATRIX, schemeHeader, VERIFY_BUDGET } from '@meteortoll/core'
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
    treasuryPools,
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
    const grace = Number(flag(args, 'grace', PROFILE === 'mainnet' ? '9000' : '150'))
    if (!Number.isInteger(grace) || grace < MIN_GRACE_SLOTS || grace > MAX_GRACE_SLOTS) throw new Error(`--grace must be from ${MIN_GRACE_SLOTS} to ${MAX_GRACE_SLOTS} slots`)
    if (PROFILE === 'mainnet' && !args.includes('--treasury')) throw new Error('on mainnet, pass --treasury <address> explicitly: the fee claimer is permanent')
    const treasury = new PublicKey(flag(args, 'treasury', wallet.publicKey.toBase58()))
    const config = Keypair.generate()
    const settings = clusterEconomics()
    const params = launchParams((PROFILE === 'mainnet' ? 'mainnet' : 'devnet') as Profile, settings)
    console.log(
        `economics: treasury ${settings.treasurySharePercent}% of the fees the protocol leaves, launch fee ${settings.launchFeeSol} SOL (${(settings.launchFeeSol * (100 - PROTOCOL_POOL_CREATION_FEE_PERCENT)) / 100} SOL after Meteora's ${PROTOCOL_POOL_CREATION_FEE_PERCENT}%), paid to ${treasury.toBase58()}`
    )
    const create = await dbc.partner.createConfig({
        ...params,
        config: config.publicKey,
        feeClaimer: treasury,
        leftoverReceiver: treasury,
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
    if (![n1, n2, n3, target].every((v) => Number.isInteger(v) && v >= 1)) throw new Error('usage: launch n1 n2 n3 target --name NAME --symbol SYMBOL')
    const invalid = statementProblem([n1, n2, n3], target)
    if (invalid) throw new Error(`launch refused: ${invalid}`)
    const refused = targetProblem([n1, n2, n3], target)
    if (refused) throw new Error(`launch refused: ${refused}`)
    const team = knownFormat(n1, n2, n3)?.team
    if (team && team.rank <= target && !args.includes('--demo')) throw new Error(`launch refused: the team already holds a rank-${team.rank} scheme for this format; pass --demo to launch it as a disclosed demo`)
    const name = flag(args, 'name')
    const symbol = flag(args, 'symbol')
    if (name.length > 32 || symbol.length > 10) throw new Error('the name may have at most 32 characters and the symbol at most 10')
    const state = loadState()
    if (!state.config || !state.launchpad) throw new Error('run setup first')
    const config = new PublicKey(state.config)
    const resumePool = flag(args, 'pool', '')
    const base = resumePool ? null : Keypair.generate()
    const baseMint = base ? base.publicKey : new PublicKey(flag(args, 'base'))
    const uri = flag(args, 'uri', metadataUri(SITE_URL, baseMint.toBase58()))
    const badUri = siteProblem(uri, PROFILE === 'mainnet')
    if (badUri) throw new Error(`launch refused: ${badUri}`)
    const pool = deriveDbcPoolAddress(NATIVE_MINT, baseMint, config)
    if (resumePool && !pool.equals(new PublicKey(resumePool))) throw new Error('--pool does not match --base and the config')
    const problem = problemAddress(new PublicKey(state.launchpad), pool, KIND_MATRIX, [n1, n2, n3], target)

    const handOver = () =>
        createDbcProgram(connection).program.methods.transferPoolCreator().accountsPartial({ virtualPool: pool, config, creator: wallet.publicKey, newCreator: problem }).instruction()
    let creator = problem
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
        create.add(await handOver())
        console.log(`create pool ${pool.toBase58()} (base ${baseMint.toBase58()}) owned by problem ${problem.toBase58()}: ${explorer(await sendTx(create, wallet, [base]))}`)
    } else {
        const found = await dbc.state.getPool(pool)
        if (!found) throw new Error(`pool ${pool.toBase58()} not found`)
        creator = found.poolState.creator
        if (!creator.equals(problem) && !creator.equals(wallet.publicKey)) throw new Error(`pool ${pool.toBase58()} belongs to ${creator.toBase58()}`)
    }

    const tx = new Transaction()
    if (!creator.equals(problem)) tx.add(await handOver())
    const register = await methods
        .registerProblem(KIND_MATRIX, n1, n2, n3, target)
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
    tx.add(register)
    console.log(`${tx.instructions.length > 1 ? 'hand pool to problem and register' : 'register'} ${problem.toBase58()}: ${explorer(await sendTx(tx, wallet))}`)

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
    const limits = parseLimits(flag(args, 'slippage', String(SLIPPAGE_BPS / 100)), flag(args, 'max-fee', String(MAX_FEE_PERCENT)))
    const { tx, quote } = await buyTransaction(dbc, connection, wallet.publicKey, new PublicKey(found.pool), new BN(lamports), limits)
    console.log(`quote ${quote.outputAmount.toString()} ${found.symbol} base units, at least ${quote.minimumAmountOut.toString()}, fee ${quote.feePercent.toFixed(2)}%`)
    console.log(`buy ${args[1]} SOL of ${found.symbol}: ${explorer(await sendTx(tx, wallet))}`)
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
    const scheme = readScheme(args[1])
    const budget = Number(flag(args, 'budget', String(VERIFY_BUDGET)))
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
        console.log(`reveal: ${explorer(await send([reveal], wallet, [], Math.min(1_400_000, 60_000 + Math.ceil(scheme.length / 2))))}`)
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
        const final = account.solver !== null && Number(account.pending ?? 0) === 0 && slot >= account.solvedAtSlot.toNumber() + account.graceSlots.toNumber()
        console.log(
            `${key} ${found.symbol}: bounty ${SOL(await tokenBalance(account.quoteVault))} SOL, unswept ${SOL(owed)} SOL, ` +
                `attempts ${account.attempts}, solver ${account.solver?.toBase58() ?? 'none'}${account.solver ? (final ? ' (final)' : ' (in grace)') : ''}`
        )
    }
}

const MARGIN_LAMPORTS = 50_000_000

async function preflight(args: string[]) {
    let ok = true
    const fail = (line: string) => {
        ok = false
        console.log(`  ✗ ${line}`)
    }
    const cluster = await clusterOf(connection)
    console.log(`RPC cluster: ${cluster}`)
    const mismatch = clusterProblem(cluster, CLUSTER) ?? profileProblem(cluster, CLUSTER, PROFILE)
    if (mismatch) fail(mismatch)
    else if (PROFILE !== CLUSTER) console.log(`  ✓ rehearsing the ${PROFILE} profile on ${cluster}`)

    if (CLUSTER === 'mainnet') {
        const devnetKey = resolve(ROOT, '.keys/devnet.json')
        if (existsSync(devnetKey) && loadKeypair(devnetKey).publicKey.equals(wallet.publicKey)) fail('the mainnet wallet is the devnet key; use a key that never left this machine for anything else')
        else console.log(`  ✓ the mainnet wallet ${wallet.publicKey.toBase58()} is not the devnet key`)
    }

    const so = flag(args, 'so', '//wsl.localhost/meteortoll/home/dev/target-meteortoll/deploy/toll.so')
    const local = readFileSync(so)
    console.log(`local program: ${local.length} bytes, sha256 ${sha256(local)}`)

    const base = await connection.getMinimumBalanceForRentExemption(0)
    const perByte = (await connection.getMinimumBalanceForRentExemption(1000)) / 1000 - base / 1000
    const rent = (bytes: number) => Math.ceil(base + perByte * bytes)
    const programId = toll.programId
    const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE)
    const deployed = await connection.getAccountInfo(programData)
    let needed = 0
    if (!deployed) {
        const cost = deployCost(local.length, rent)
        needed += cost.peak
        console.log(`program ${programId.toBase58()}: not deployed; the deploy holds ${SOL(cost.peak)} SOL at its peak and keeps ${SOL(cost.kept)}`)
    } else {
        const authority = upgradeAuthority(deployed.data)
        console.log(`program ${programId.toBase58()}: deployed, upgrade authority ${authority?.toBase58() ?? 'none (immutable)'}`)
        if (programDataMatches(deployed.data, local)) console.log('  ✓ the deployed program is byte for byte the local build')
        else fail('the deployed program differs from the local build')
    }

    const state = loadState()
    const settings = clusterEconomics()
    if (state.config) {
        const config = await dbc.state.getPoolConfig(new PublicKey(state.config))
        const share = config ? 100 - config.creatorTradingFeePercentage : null
        const fee = config ? Number(config.poolCreationFee.toString()) / LAMPORTS_PER_SOL : null
        if (share === settings.treasurySharePercent && fee === settings.launchFeeSol) console.log(`  ✓ the launchpad config matches problems/economics.json (treasury ${share}%, launch fee ${fee} SOL)`)
        else fail(`the launchpad config (treasury ${share}%, launch fee ${fee} SOL) differs from problems/economics.json (${settings.treasurySharePercent}%, ${settings.launchFeeSol} SOL)`)
        if (config) {
            const expected = launchParams((PROFILE === 'mainnet' ? 'mainnet' : 'devnet') as Profile, settings) as unknown as {
                poolFees: { baseFee: Record<string, { toString(): string }> }
                enableFirstSwapWithMinFee: boolean
            }
            const fields = ['cliffFeeNumerator', 'firstFactor', 'secondFactor', 'thirdFactor', 'baseFeeMode']
            const actual = config.poolFees.baseFee as unknown as Record<string, { toString(): string }>
            const differs = fields.filter((f) => expected.poolFees.baseFee[f]?.toString() !== actual[f]?.toString())
            const minFee = Number(config.enableFirstSwapWithMinFee) === 1
            if (differs.length === 0 && minFee === expected.enableFirstSwapWithMinFee)
                console.log(`  ✓ the launch fee schedule matches problems/economics.json (${settings.launchWindow ? 'launch window' : 'flat 1%'})`)
            else fail(`the launch fee schedule differs from problems/economics.json: ${[...differs, ...(minFee === expected.enableFirstSwapWithMinFee ? [] : ['enableFirstSwapWithMinFee'])].join(', ')}`)
        }
    } else {
        console.log(`economics for setup: treasury ${settings.treasurySharePercent}%, launch fee ${settings.launchFeeSol} SOL`)
    }
    if (!state.launchpad) needed += SETUP_LAMPORTS
    console.log(`launchpad: ${state.launchpad ?? 'not set up'}`)
    const problems = Number(flag(args, 'problems', '4'))
    needed += problems * launchLamports(clusterEconomics().launchFeeSol) + MARGIN_LAMPORTS
    const balance = await connection.getBalance(wallet.publicKey)
    console.log(`wallet ${wallet.publicKey.toBase58()}: ${SOL(balance)} SOL; the remaining stages and ${problems} launch(es) need ${SOL(needed)} SOL`)
    if (balance < needed) fail(`short by ${SOL(needed - balance)} SOL`)
    console.log(ok ? 'preflight: go' : 'preflight: no go')
    if (!ok) process.exitCode = 1
}

const PARTNER_CREATION_FEE_CLAIMED = 0b10

function clusterEconomics(): Economics {
    const all = JSON.parse(readFileSync(resolve(ROOT, 'problems/economics.json'), 'utf8')) as Record<string, Economics>
    const settings = all[PROFILE]
    if (!settings) throw new Error(`problems/economics.json has no entry for ${PROFILE}`)
    return settings
}

async function treasury() {
    const state = loadState()
    if (!state.config || !state.launchpad) throw new Error('run setup first')
    const config = await dbc.state.getPoolConfig(new PublicKey(state.config))
    if (!config) throw new Error('the launchpad config is missing on this network')
    if (!config.feeClaimer.equals(wallet.publicKey)) throw new Error(`the treasury is ${config.feeClaimer.toBase58()}; run this with that wallet`)
    const threshold = BigInt(config.migrationQuoteThreshold.toString())
    let claimed = 0
    for (const { label: key, pool } of await treasuryPools(toll, new PublicKey(state.launchpad), state.problems)) {
        const account = await dbc.state.getPool(pool)
        const poolState = account?.poolState ?? (account as never)
        if (!poolState) continue
        const steps: [string, () => Promise<import('@solana/web3.js').Transaction>][] = []
        if (BigInt(poolState.partnerQuoteFee.toString()) > 0n || BigInt(poolState.partnerBaseFee.toString()) > 0n) {
            steps.push(['trading fees', () => dbc.partner.claimPartnerTradingFee2({ feeClaimer: wallet.publicKey, payer: wallet.publicKey, pool, maxBaseAmount: U64_MAX, maxQuoteAmount: U64_MAX, receiver: wallet.publicKey })])
        }
        if (BigInt(config.poolCreationFee.toString()) > 0n && (poolState.creationFeeBits & PARTNER_CREATION_FEE_CLAIMED) === 0) {
            steps.push(['launch fee', () => dbc.partner.claimPartnerPoolCreationFee({ pool, feeReceiver: wallet.publicKey })])
        }
        if (BigInt(poolState.quoteReserve.toString()) >= threshold && poolState.isPartnerWithdrawSurplus === 0 && config.creatorTradingFeePercentage < 100) {
            steps.push(['surplus share', () => dbc.partner.partnerWithdrawSurplus({ feeClaimer: wallet.publicKey, pool })])
        }
        for (const [what, build] of steps) {
            console.log(`${key}: ${what}: ${explorer(await sendTx(await build(), wallet))}`)
            claimed += 1
        }
    }
    console.log(claimed ? `claimed ${claimed} time(s)` : 'nothing to claim')
}

const commands: Record<string, (args: string[]) => Promise<void>> = { preflight, setup, treasury, launch, buy, sweep, solve, claim, close, status }
const [command, ...rest] = process.argv.slice(2)
if (!commands[command]) {
    console.error(`commands: ${Object.keys(commands).join(', ')}`)
    process.exit(2)
}
if (command !== 'preflight') await assertCluster(connection, CLUSTER, PROFILE)
await commands[command](rest)
