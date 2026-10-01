// Moving a problem's fees into its bounty vault. Three sources, all permissionless sweeps of the
// toll program: the curve's creator trading fees (DBC; these keep accruing until swept, also
// after graduation), the creator's share of the surplus once the curve completes (DBC), and the
// fees of the locked DAMM v2 position that DBC hands to the problem at graduation.

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

/// Which DBC sweeps have something to move. The surplus can be taken once the curve has reached
/// its migration threshold, and only once.
export function planDbcSweeps(pool: Pick<PoolState, 'creator_base_fee' | 'creator_quote_fee' | 'quote_reserve' | 'is_creator_withdraw_surplus'>, migrationQuoteThreshold: bigint) {
    const trading = BigInt(pool.creator_base_fee.toString()) > 0n || BigInt(pool.creator_quote_fee.toString()) > 0n
    const surplus = BigInt(pool.quote_reserve.toString()) >= migrationQuoteThreshold && pool.is_creator_withdraw_surplus === 0
    return { trading, surplus }
}

/// The DAMM v2 position NFTs among a problem's Token-2022 accounts. DAMM v2 keeps each position's
/// NFT in an account at a fixed address derived from the NFT mint, so an account counts only if it
/// sits at that address and holds the NFT; anything else the problem happens to own is ignored.
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

export async function findPositions(connection: Connection, problem: PublicKey, baseMint: PublicKey, quoteMint: PublicKey): Promise<DammPosition[]> {
    const owned = await withRetry(() => connection.getTokenAccountsByOwner(problem, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'))
    const nfts = positionNfts(owned.value.map(({ pubkey, account }) => ({ pubkey, data: account.data })))
    if (nfts.length === 0) return []
    const positions = nfts.map(({ mint }) => dammPda(seed('position'), mint.toBuffer()))
    const infos = await withRetry(() => connection.getMultipleAccountsInfo(positions, 'confirmed'))
    const found: DammPosition[] = []
    nfts.forEach(({ mint, account }, i) => {
        const info = infos[i]
        // Position layout: discriminator, then the pool, then the NFT mint.
        if (!info || !info.owner.equals(DAMM_V2) || info.data.length < 72) return
        if (!new PublicKey(info.data.subarray(40, 72)).equals(mint)) return
        const dammPool = new PublicKey(info.data.subarray(8, 40))
        found.push({
            position: positions[i],
            positionNftAccount: account,
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

/// Solana's limit on a serialized transaction.
export const PACKET = 1232
/// Room kept free for the compute budget the sender adds (program key, limit and price).
export const BUDGET_ROOM = 96

/// Serialized size; Infinity for instructions web3.js cannot even encode into one packet.
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

/// Packs groups of instructions into as few transactions as fit, in order. A group stays whole
/// (a claim with its token accounts, say); a group that cannot fit even alone is an error rather
/// than a transaction the network would reject.
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

/// A token account's amount, from its raw data (SPL layout: mint, owner, then the u64 amount).
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

/// What one transaction would add to the vaults, simulated against the current state.
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

/// What sending these sweeps would add to the vaults. The sweeps draw from separate sources, so
/// their gains add up.
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

/// The sweeps that would move something. A graduated position stays with the problem for good,
/// so without this every claim and sweep would also pay for sweeping an empty position.
export async function productive(connection: Connection, ixs: TransactionInstruction[], payer: PublicKey, vaults: Vaults): Promise<TransactionInstruction[]> {
    if (ixs.length === 0) return ixs
    const now = await vaultAmounts(connection, vaults)
    const kept: TransactionInstruction[] = []
    for (const ix of ixs) {
        const gain = await simulateGain(connection, new Transaction().add(ix), payer, vaults, now)
        if (gain.quote > 0n || gain.base > 0n) kept.push(ix)
    }
    return kept
}
