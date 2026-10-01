// Launching a problem: a DBC pool on the launchpad's config, handed to the problem's address,
// and the problem registered. Two transactions, signed together in one wallet approval.

import type { Program } from '@coral-xyz/anchor'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { type Connection, Keypair, type PublicKey, Transaction } from '@solana/web3.js'
import { createDbcProgram, deriveDbcPoolAddress, DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { problemAddress, vaultAddress } from '@meteortoll/core'
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
}

/// Problems a statement can be: positive dimensions up to 16 and a target below the schoolbook rank.
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
    const accounts = program.account as never as Record<string, { fetch(key: PublicKey): Promise<unknown> }>
    const { dbcConfig: config } = (await withRetry(() => accounts.launchpad.fetch(launchpad))) as Launchpad
    const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
    const poolConfig = await withRetry(() => dbc.state.getPoolConfig(config))
    if (!poolConfig) throw new Error('the launchpad config is missing on this network')
    const quoteMint = poolConfig.quoteMint

    const baseMint = Keypair.generate()
    const pool = deriveDbcPoolAddress(quoteMint, baseMint.publicKey, config)
    const problem = problemAddress(pool, request.n, request.target)

    const create = await withRetry(() =>
        dbc.creator.createPool({
            name: request.name.trim(),
            symbol: request.symbol,
            uri: `${siteUrl}/api/metadata/${baseMint.publicKey.toBase58()}`,
            payer: owner,
            poolCreator: owner,
            config,
            baseMint: baseMint.publicKey,
        })
    )

    // The SDK's transferPoolCreator reads the pool first; this pool does not exist until the
    // first transaction lands, so the instruction is built from the program client directly.
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
