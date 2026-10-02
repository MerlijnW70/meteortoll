import type { Program } from '@coral-xyz/anchor'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { type Connection, PublicKey, Transaction, type TransactionInstruction, VersionedTransaction } from '@solana/web3.js'
import { DAMM_V2, DBC, dammEventAuthority, dammPoolAuthority, dbcEventAuthority, dbcPoolAuthority, type ProblemAccount } from '@meteortoll/core'
import { failureFromStatus } from './errors'
import { withRetry } from './rpc'
import { methods } from './solve/program'
import { decodePoolConfig, decodePoolState, type PoolState } from './chain'

const dammPda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, DAMM_V2)[0]
const seed = (text: string) => Buffer.from(text)

export interface SweepPlan {
    trading: boolean
    surplus: boolean
    positions: DammPosition[]
}

export interface DammPosition {
    position: PublicKey
    positionNftAccount: PublicKey
    dammPool: PublicKey
    dammBaseVault: PublicKey
    dammQuoteVault: PublicKey
}

export function planDbcSweeps(pool: Pick<PoolState, 'creator_base_fee' | 'creator_quote_fee' | 'quote_reserve' | 'is_creator_withdraw_surplus'>, migrationQuoteThreshold: bigint) {
    const trading = BigInt(pool.creator_base_fee.toString()) > 0n || BigInt(pool.creator_quote_fee.toString()) > 0n
    const surplus = BigInt(pool.quote_reserve.toString()) >= migrationQuoteThreshold && pool.is_creator_withdraw_surplus === 0
    return { trading, surplus }
}

export function positionNfts(accounts: { pubkey: PublicKey; data: Uint8Array }[]): { mint: PublicKey; account: PublicKey }[] {
    const found: { mint: PublicKey; account: PublicKey }[] = []
    for (const { pubkey, data } of accounts) {
        if (data.length < 72) continue
        const mint = new PublicKey(data.subarray(0, 32))
        const amount = new DataView(data.buffer, data.byteOffset + 64, 8).getBigUint64(0, true)
        if (amount === 1n && pubkey.equals(dammPda(seed('position_nft_account'), mint.toBuffer()))) found.push({ mint, account: pubkey })
    }
    return found
}

export const DAMM_POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188])
export const DAMM_TOKEN_A_MINT_OFFSET = 168

export function dammPoolPairs(info: { owner: PublicKey; data: Uint8Array } | null | undefined, baseMint: PublicKey, quoteMint: PublicKey): boolean {
    if (!info || !info.owner.equals(DAMM_V2) || info.data.length < DAMM_TOKEN_A_MINT_OFFSET + 64) return false
    if (!Buffer.from(info.data.subarray(0, 8)).equals(DAMM_POOL_DISCRIMINATOR)) return false
    const tokenA = new PublicKey(info.data.subarray(DAMM_TOKEN_A_MINT_OFFSET, DAMM_TOKEN_A_MINT_OFFSET + 32))
    const tokenB = new PublicKey(info.data.subarray(DAMM_TOKEN_A_MINT_OFFSET + 32, DAMM_TOKEN_A_MINT_OFFSET + 64))
    return tokenA.equals(baseMint) && tokenB.equals(quoteMint)
}

export async function findPositions(connection: Connection, problem: PublicKey, baseMint: PublicKey, quoteMint: PublicKey): Promise<DammPosition[]> {
    const owned = await withRetry(() => connection.getTokenAccountsByOwner(problem, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'))
    const nfts = positionNfts(owned.value.map(({ pubkey, account }) => ({ pubkey, data: account.data })))
    if (nfts.length === 0) return []
    const positions = nfts.map(({ mint }) => dammPda(seed('position'), mint.toBuffer()))
    const infos = await withRetry(() => connection.getMultipleAccountsInfo(positions, 'confirmed'))
    const candidates: { position: PublicKey; positionNftAccount: PublicKey; dammPool: PublicKey }[] = []
    nfts.forEach(({ mint, account }, i) => {
        const info = infos[i]
        if (!info || !info.owner.equals(DAMM_V2) || info.data.length < 72) return
        if (!new PublicKey(info.data.subarray(40, 72)).equals(mint)) return
        candidates.push({ position: positions[i], positionNftAccount: account, dammPool: new PublicKey(info.data.subarray(8, 40)) })
    })
    if (candidates.length === 0) return []
    const pools = await withRetry(() => connection.getMultipleAccountsInfo(candidates.map((c) => c.dammPool), 'confirmed'))
    const found: DammPosition[] = []
    candidates.forEach(({ position, positionNftAccount, dammPool }, i) => {
        if (!dammPoolPairs(pools[i], baseMint, quoteMint)) return
        found.push({
            position,
            positionNftAccount,
            dammPool,
            dammBaseVault: dammPda(seed('token_vault'), baseMint.toBuffer(), dammPool.toBuffer()),
            dammQuoteVault: dammPda(seed('token_vault'), quoteMint.toBuffer(), dammPool.toBuffer()),
        })
    })
    return found
}

export async function sweepPlan(connection: Connection, problemAddress: PublicKey, problem: ProblemAccount): Promise<SweepPlan & { pool: PoolState | null }> {
    const [poolInfo, positions] = await Promise.all([
        withRetry(() => connection.getAccountInfo(problem.pool, 'confirmed')),
        findPositions(connection, problemAddress, problem.baseMint, problem.quoteMint),
    ])
    const pool = decodePoolState(poolInfo)
    if (!pool) return { trading: false, surplus: false, positions, pool }
    const config = decodePoolConfig(await withRetry(() => connection.getAccountInfo(pool.config, 'confirmed')))
    const dbc = config ? planDbcSweeps(pool, config.migrationQuoteThreshold) : { trading: false, surplus: false }
    return { ...dbc, positions, pool }
}

export async function sweepInstructions(program: Program, problemAddress: PublicKey, problem: ProblemAccount, plan: SweepPlan & { pool: PoolState | null }) {
    const ixs: TransactionInstruction[] = []
    const { pool } = plan
    if (pool && plan.trading) {
        ixs.push(
            await methods(program)
                .sweepTradingFees()
                .accountsPartial({
                    problem: problemAddress,
                    pool: problem.pool,
                    poolAuthority: dbcPoolAuthority,
                    baseVault: problem.baseVault,
                    quoteVault: problem.quoteVault,
                    poolBaseVault: pool.base_vault,
                    poolQuoteVault: pool.quote_vault,
                    baseMint: problem.baseMint,
                    quoteMint: problem.quoteMint,
                    baseTokenProgram: TOKEN_PROGRAM_ID,
                    quoteTokenProgram: TOKEN_PROGRAM_ID,
                    eventAuthority: dbcEventAuthority,
                    dbcProgram: DBC,
                })
                .instruction()
        )
    }
    if (pool && plan.surplus) {
        ixs.push(
            await methods(program)
                .sweepSurplus()
                .accountsPartial({
                    problem: problemAddress,
                    pool: problem.pool,
                    config: pool.config,
                    poolAuthority: dbcPoolAuthority,
                    quoteVault: problem.quoteVault,
                    poolQuoteVault: pool.quote_vault,
                    quoteMint: problem.quoteMint,
                    quoteTokenProgram: TOKEN_PROGRAM_ID,
                    eventAuthority: dbcEventAuthority,
                    dbcProgram: DBC,
                })
                .instruction()
        )
    }
    for (const p of plan.positions) {
        ixs.push(
            await methods(program)
                .sweepPositionFees()
                .accountsPartial({
                    problem: problemAddress,
                    dammPoolAuthority,
                    dammPool: p.dammPool,
                    position: p.position,
                    positionNftAccount: p.positionNftAccount,
                    baseVault: problem.baseVault,
                    quoteVault: problem.quoteVault,
                    dammBaseVault: p.dammBaseVault,
                    dammQuoteVault: p.dammQuoteVault,
                    baseMint: problem.baseMint,
                    quoteMint: problem.quoteMint,
                    baseTokenProgram: TOKEN_PROGRAM_ID,
                    quoteTokenProgram: TOKEN_PROGRAM_ID,
                    dammEventAuthority,
                    dammProgram: DAMM_V2,
                })
                .instruction()
        )
    }
    return ixs
}

export const PACKET = 1232
export const BUDGET_ROOM = 96

function size(ixs: TransactionInstruction[], payer: PublicKey): number {
    const tx = new Transaction().add(...ixs)
    tx.feePayer = payer
    tx.recentBlockhash = PublicKey.default.toBase58()
    try {
        return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length
    } catch {
        return Infinity
    }
}

export function pack(groups: TransactionInstruction[][], payer: PublicKey): Transaction[] {
    const limit = PACKET - BUDGET_ROOM
    const txs: TransactionInstruction[][] = []
    for (const group of groups) {
        if (group.length === 0) continue
        if (size(group, payer) > limit) throw new Error(`an instruction group of ${group.length} instructions does not fit one transaction`)
        const last = txs.at(-1)
        if (last && size([...last, ...group], payer) <= limit) last.push(...group)
        else txs.push([...group])
    }
    return txs.map((ixs) => new Transaction().add(...ixs))
}

export function tokenAccountAmount(data: Uint8Array | null | undefined): bigint {
    if (!data || data.length < 72) return 0n
    return new DataView(data.buffer, data.byteOffset + 64, 8).getBigUint64(0, true)
}

export interface Vaults {
    quote: PublicKey
    base: PublicKey
}

export interface Gain {
    quote: bigint
    base: bigint
}

async function vaultAmounts(connection: Connection, vaults: Vaults): Promise<Gain> {
    const [quote, base] = await withRetry(() => connection.getMultipleAccountsInfo([vaults.quote, vaults.base], 'confirmed'))
    return { quote: tokenAccountAmount(quote?.data), base: tokenAccountAmount(base?.data) }
}

async function simulateGain(connection: Connection, tx: Transaction, payer: PublicKey, vaults: Vaults, now: Gain): Promise<Gain> {
    tx.feePayer = payer
    tx.recentBlockhash = PublicKey.default.toBase58()
    const simulated = await withRetry(() =>
        connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
            sigVerify: false,
            replaceRecentBlockhash: true,
            commitment: 'confirmed',
            accounts: { encoding: 'base64', addresses: [vaults.quote.toBase58(), vaults.base.toBase58()] },
        })
    )
    if (simulated.value.err) throw failureFromStatus(simulated.value.err, tx.instructions.map((ix) => ix.programId), simulated.value.logs ?? [])
    const [quote, base] = (simulated.value.accounts ?? []).map((a) => tokenAccountAmount(a ? Buffer.from(a.data[0], 'base64') : null))
    return { quote: (quote ?? now.quote) - now.quote, base: (base ?? now.base) - now.base }
}

export async function previewGain(connection: Connection, txs: Transaction[], payer: PublicKey, vaults: Vaults): Promise<Gain> {
    const now = await vaultAmounts(connection, vaults)
    const total: Gain = { quote: 0n, base: 0n }
    for (const tx of txs) {
        const gain = await simulateGain(connection, tx, payer, vaults, now)
        total.quote += gain.quote
        total.base += gain.base
    }
    return total
}

export async function productive(connection: Connection, ixs: TransactionInstruction[], payer: PublicKey, vaults: Vaults): Promise<TransactionInstruction[]> {
    if (ixs.length === 0) return ixs
    const now = await vaultAmounts(connection, vaults)
    const kept: TransactionInstruction[] = []
    for (const ix of ixs) {
        const gain = await simulateGain(connection, new Transaction().add(ix), payer, vaults, now).catch(() => null)
        if (gain && (gain.quote > 0n || gain.base > 0n)) kept.push(ix)
    }
    return kept
}
