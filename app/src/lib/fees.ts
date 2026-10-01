// Compute budget for the app's transactions. On a busy mainnet a transaction without a priority
// fee may never land, and one with the default compute limit pays for units it does not use.
// The limit comes from the transaction's own simulation, the price from what recent transactions
// paid to write the same accounts, capped so a fee spike cannot drain a wallet.

import { ComputeBudgetProgram, type Connection, type PublicKey, type Transaction } from '@solana/web3.js'
import { withRetry } from './rpc'

/// Highest price the app offers, in micro-lamports per compute unit: at most 0.0007 SOL for a
/// transaction that uses the full 1.4M units.
export const MAX_PRICE = 500_000
/// The runtime's per-transaction ceiling on compute units.
export const MAX_UNITS = 1_400_000
/// Slack on the simulated units: state can change between simulation and execution.
const HEADROOM = 1.2
const SPARE_UNITS = 5_000

export const hasComputeBudget = (tx: Transaction) => tx.instructions.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId))

/// A limit that covers the simulated units with headroom, within the runtime's ceiling.
export function unitLimit(consumed: number): number {
    return Math.min(MAX_UNITS, Math.ceil(consumed * HEADROOM) + SPARE_UNITS)
}

/// The 75th percentile of recent prices for the same accounts: enough to land ahead of most
/// competing writes without bidding against the very top. Capped at MAX_PRICE.
export function priorityPrice(recent: number[]): number {
    if (recent.length === 0) return 0
    const sorted = [...recent].sort((a, b) => a - b)
    const price = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]
    return Math.min(MAX_PRICE, Math.max(0, Math.round(price)))
}

/// Writable accounts across transactions; the RPC accepts at most 128.
function writableAccounts(txs: Transaction[]): PublicKey[] {
    const seen = new Map<string, PublicKey>()
    for (const tx of txs) for (const ix of tx.instructions) for (const key of ix.keys) if (key.isWritable) seen.set(key.pubkey.toBase58(), key.pubkey)
    return [...seen.values()].slice(0, 128)
}

export async function estimatePrice(connection: Connection, txs: Transaction[]): Promise<number> {
    const recent = await withRetry(() => connection.getRecentPrioritizationFees({ lockedWritableAccounts: writableAccounts(txs) }))
    return priorityPrice(recent.map((r) => r.prioritizationFee))
}

/// Puts the compute budget first, unless the transaction already sets its own (verify cranks do).
/// Without simulated units the runtime's default limit stays; only the price is set.
export function applyBudget(tx: Transaction, { units, price }: { units?: number; price: number }): Transaction {
    if (hasComputeBudget(tx)) return tx
    const budget = []
    if (units !== undefined) budget.push(ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit(units) }))
    if (price > 0) budget.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }))
    tx.instructions = [...budget, ...tx.instructions]
    return tx
}
