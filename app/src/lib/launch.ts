import type { Program } from '@coral-xyz/anchor'
import type BN from 'bn.js'
import { ACCOUNT_SIZE, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { type Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import {
    BaseFeeMode,
    createDbcProgram,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    type FirstBuyParams,
    getBaseFeeParams,
    getCurrentPoint,
    MigrationFeeOption,
    MigrationOption,
    type PoolConfig,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { creatorTradingFeePercentage, type Economics, problemAddress, vaultAddress } from '@meteortoll/core'
import { CLUSTER, DBC_CONFIG } from './config'
import { ECONOMICS } from './economics'
import { quoteFirstBuy } from './firstBuy'
import { withRetry } from './rpc'
import { methods } from './solve/program'

export const MAX_DIMENSION = 16
export const NAME_LIMIT = 32
export const SYMBOL_LIMIT = 10

export interface LaunchRequest {
    n: [number, number, number]
    target: number
    name: string
    symbol: string
    firstBuy: BN
}

export function statementProblem({ n, target, name, symbol }: LaunchRequest): string | null {
    if (n.some((d) => !Number.isInteger(d) || d < 1 || d > MAX_DIMENSION)) return `dimensions must be whole numbers from 1 to ${MAX_DIMENSION}`
    const naive = n[0] * n[1] * n[2]
    if (!Number.isInteger(target) || target < 1) return 'the target must be a whole number of at least 1'
    if (target >= naive) return `the target must be below the schoolbook rank ${naive}`
    if (!name.trim() || new TextEncoder().encode(name).length > NAME_LIMIT) return `the name needs 1 to ${NAME_LIMIT} bytes`
    if (!/^[A-Z0-9]+$/.test(symbol) || symbol.length > SYMBOL_LIMIT) return `the symbol needs 1 to ${SYMBOL_LIMIT} capital letters or digits`
    return null
}

interface Launchpad {
    dbcConfig: PublicKey
}

type Accounts = Record<string, { fetch(key: PublicKey): Promise<unknown>; size: number }>

export interface Pinned {
    config: PublicKey | null
    economics: Economics
}

const PINNED: Pinned = { config: DBC_CONFIG, economics: ECONOMICS }

function expectedBaseFee(economics: Economics) {
    const window = economics.launchWindow
    return getBaseFeeParams(
        window
            ? {
                  baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                  feeSchedulerParam: { startingFeeBps: window.startingFeeBps, endingFeeBps: window.endingFeeBps, numberOfPeriod: window.numberOfPeriod, totalDuration: window.totalDurationSlots },
              }
            : { baseFeeMode: BaseFeeMode.FeeSchedulerLinear, feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 } }
    )
}

export function termsProblem(config: PoolConfig, economics: Economics): string | null {
    if (!config.quoteMint.equals(NATIVE_MINT)) return 'it does not trade against SOL'
    if (BigInt(config.poolCreationFee.toString()) !== BigInt(Math.round(economics.launchFeeSol * 1e9)))
        return `its launch fee is ${Number(config.poolCreationFee.toString()) / 1e9} SOL, not ${economics.launchFeeSol} SOL`
    const share = creatorTradingFeePercentage(economics)
    if (config.creatorTradingFeePercentage !== share) return `it sends ${config.creatorTradingFeePercentage}% of trading fees to the bounty, not ${share}%`
    const fee = expectedBaseFee(economics)
    const actual = config.poolFees.baseFee
    const sameFee =
        actual.baseFeeMode === fee.baseFeeMode &&
        actual.firstFactor === fee.firstFactor &&
        actual.cliffFeeNumerator.eq(fee.cliffFeeNumerator) &&
        actual.secondFactor.eq(fee.secondFactor) &&
        actual.thirdFactor.eq(fee.thirdFactor) &&
        Number(config.enableFirstSwapWithMinFee) === (economics.launchWindow ? 1 : 0)
    if (!sameFee) return 'its fee schedule differs'
    if (config.migrationOption !== MigrationOption.MET_DAMM_V2 || config.migrationFeeOption !== MigrationFeeOption.FixedBps100) return 'its migration differs'
    return null
}

export async function launchTerms(connection: Connection, program: Program, launchpad: PublicKey, pinned: Pinned = PINNED): Promise<{ address: PublicKey; config: PoolConfig }> {
    const expected = pinned.config
    if (!expected) throw new Error(`Launching is not open on ${CLUSTER} yet: no launchpad config is pinned for it.`)
    const { dbcConfig: address } = (await withRetry(() => (program.account as never as Accounts).launchpad.fetch(launchpad))) as Launchpad
    if (!address.equals(expected)) throw new Error(`The launchpad reports config ${address.toBase58()}, not the expected ${expected.toBase58()}. Launching is refused.`)
    const config = await withRetry(() => new DynamicBondingCurveClient(connection, 'confirmed').state.getPoolConfig(expected))
    if (!config) throw new Error('the launchpad config is missing on this network')
    const problem = termsProblem(config, pinned.economics)
    if (problem) throw new Error(`The launchpad config does not match the published terms: ${problem}. Launching is refused.`)
    return { address: expected, config }
}

const FIRST_BUY_TOLERANCE_BPS = 50

export interface PreparedLaunch {
    create: Transaction
    register: Transaction
    baseMint: Keypair
    pool: PublicKey
    problem: PublicKey
}

export async function prepareLaunch(
    connection: Connection,
    program: Program,
    launchpad: PublicKey,
    owner: PublicKey,
    request: LaunchRequest,
    siteUrl: string,
    pinned: Pinned = PINNED
): Promise<PreparedLaunch> {
    const { address: config, config: poolConfig } = await launchTerms(connection, program, launchpad, pinned)
    const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
    const quoteMint = poolConfig.quoteMint

    const baseMint = Keypair.generate()
    const pool = deriveDbcPoolAddress(quoteMint, baseMint.publicKey, config)
    const problem = problemAddress(pool, request.n, request.target)

    const createPoolParam = {
        name: request.name.trim(),
        symbol: request.symbol,
        uri: `${siteUrl}/api/metadata/${baseMint.publicKey.toBase58()}`,
        payer: owner,
        poolCreator: owner,
        config,
        baseMint: baseMint.publicKey,
    }
    let firstBuyParam: FirstBuyParams | undefined
    if (request.firstBuy.gtn(0)) {
        const point = await withRetry(() => getCurrentPoint(connection, poolConfig.activationType))
        const { tokens } = quoteFirstBuy(poolConfig, request.firstBuy, point)
        const minimumAmountOut = tokens.muln(10_000 - FIRST_BUY_TOLERANCE_BPS).divn(10_000)
        firstBuyParam = { buyer: owner, buyAmount: request.firstBuy, minimumAmountOut, referralTokenAccount: null }
    }
    const create = await withRetry(() => dbc.creator.createPoolWithFirstBuy({ createPoolParam, firstBuyParam }))
    const register = await registerTransaction(connection, program, { launchpad, config, pool, quoteMint, baseMint: baseMint.publicKey, owner }, request, true)
    return { create, register, baseMint, pool, problem }
}

interface RegisterAccounts {
    launchpad: PublicKey
    config: PublicKey
    pool: PublicKey
    quoteMint: PublicKey
    baseMint: PublicKey
    owner: PublicKey
}

async function registerTransaction(
    connection: Connection,
    program: Program,
    { launchpad, config, pool, quoteMint, baseMint, owner }: RegisterAccounts,
    { n, target }: Pick<LaunchRequest, 'n' | 'target'>,
    handOver: boolean
): Promise<Transaction> {
    const problem = problemAddress(pool, n, target)
    const tx = new Transaction()
    if (handOver) {
        tx.add(
            await createDbcProgram(connection)
                .program.methods.transferPoolCreator()
                .accountsPartial({ virtualPool: pool, config, creator: owner, newCreator: problem })
                .instruction()
        )
    }
    const register = await methods(program)
        .registerProblem(n[0], n[1], n[2], target)
        .accountsPartial({
            payer: owner,
            launchpad,
            config,
            pool,
            problem,
            baseMint,
            quoteMint,
            baseVault: vaultAddress(problem, baseMint),
            quoteVault: vaultAddress(problem, quoteMint),
            baseTokenProgram: TOKEN_PROGRAM_ID,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
    return tx.add(register)
}

export interface PendingLaunch {
    n: [number, number, number]
    target: number
    pool: string
    baseMint: string
}

export async function finishRegistration(
    connection: Connection,
    program: Program,
    launchpad: PublicKey,
    owner: PublicKey,
    pending: PendingLaunch,
    pinned: Pinned = PINNED
): Promise<{ register: Transaction; problem: PublicKey } | null> {
    const pool = new PublicKey(pending.pool)
    const baseMint = new PublicKey(pending.baseMint)
    const problem = problemAddress(pool, pending.n, pending.target)
    if (await withRetry(() => connection.getAccountInfo(problem, 'confirmed'))) return null
    const state = await withRetry(() => new DynamicBondingCurveClient(connection, 'confirmed').state.getPool(pool))
    if (!state) return null
    const { creator, baseMint: mint, config: poolConfigAddress } = state.poolState
    if (!mint.equals(baseMint) || !(creator.equals(owner) || creator.equals(problem))) return null
    const { address: config, config: poolConfig } = await launchTerms(connection, program, launchpad, pinned)
    if (!poolConfigAddress.equals(config)) return null
    const register = await registerTransaction(connection, program, { launchpad, config, pool, quoteMint: poolConfig.quoteMint, baseMint, owner }, pending, !creator.equals(problem))
    return { register, problem }
}

export async function launchCost(connection: Connection, program: Program, prepared: PreparedLaunch, owner: PublicKey): Promise<bigint> {
    const [before, simulated, fee, problemRent, vaultRent] = await Promise.all([
        withRetry(() => connection.getBalance(owner, 'confirmed')),
        withRetry(() =>
            connection.simulateTransaction(new VersionedTransaction(prepared.create.compileMessage()), {
                sigVerify: false,
                replaceRecentBlockhash: true,
                commitment: 'confirmed',
                accounts: { encoding: 'base64', addresses: [owner.toBase58()] },
            })
        ),
        withRetry(() => connection.getFeeForMessage(prepared.register.compileMessage(), 'confirmed')),
        withRetry(() => connection.getMinimumBalanceForRentExemption((program.account as never as Accounts).problem.size)),
        withRetry(() => connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE)),
    ])
    if (simulated.value.err) throw new Error(`the launch would fail: ${JSON.stringify(simulated.value.err)}`)
    const after = simulated.value.accounts?.[0]?.lamports
    if (after === undefined) throw new Error('the simulation returned no balance')
    return BigInt(before - after) + BigInt(fee.value ?? 0) + BigInt(problemRent + 2 * vaultRent)
}
