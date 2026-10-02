import type { Program } from '@coral-xyz/anchor'
import type BN from 'bn.js'
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { type Connection, Keypair, type PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { createDbcProgram, deriveDbcPoolAddress, DynamicBondingCurveClient, type FirstBuyParams, getCurrentPoint, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { problemAddress, vaultAddress } from '@meteortoll/core'
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

export async function launchTerms(connection: Connection, program: Program, launchpad: PublicKey): Promise<{ address: PublicKey; config: PoolConfig }> {
    const { dbcConfig: address } = (await withRetry(() => (program.account as never as Accounts).launchpad.fetch(launchpad))) as Launchpad
    const config = await withRetry(() => new DynamicBondingCurveClient(connection, 'confirmed').state.getPoolConfig(address))
    if (!config) throw new Error('the launchpad config is missing on this network')
    return { address, config }
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
    siteUrl: string
): Promise<PreparedLaunch> {
    const { address: config, config: poolConfig } = await launchTerms(connection, program, launchpad)
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

    const handOver = await createDbcProgram(connection)
        .program.methods.transferPoolCreator()
        .accountsPartial({ virtualPool: pool, config, creator: owner, newCreator: problem })
        .instruction()
    const register = await methods(program)
        .registerProblem(request.n[0], request.n[1], request.n[2], request.target)
        .accountsPartial({
            payer: owner,
            launchpad,
            config,
            pool,
            problem,
            baseMint: baseMint.publicKey,
            quoteMint,
            baseVault: vaultAddress(problem, baseMint.publicKey),
            quoteVault: vaultAddress(problem, quoteMint),
            baseTokenProgram: TOKEN_PROGRAM_ID,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
    return { create, register: new Transaction().add(handOver, register), baseMint, pool, problem }
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
