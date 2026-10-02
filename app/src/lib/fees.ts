import { ComputeBudgetProgram, type Connection, type PublicKey, type Transaction } from '@solana/web3.js'
import { withRetry } from './rpc'

export const MAX_PRICE = 500_000
export const MAX_UNITS = 1_400_000
const HEADROOM = 1.2
const SPARE_UNITS = 5_000

export const hasComputeBudget = (tx: Transaction) => tx.instructions.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId))

export function unitLimit(consumed: number): number {
    return Math.min(MAX_UNITS, Math.ceil(consumed * HEADROOM) + SPARE_UNITS)
}

export function priorityPrice(recent: number[]): number {
    if (recent.length === 0) return 0
    const sorted = [...recent].sort((a, b) => a - b)
    const price = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]
    return Math.min(MAX_PRICE, Math.max(0, Math.round(price)))
}

function writableAccounts(txs: Transaction[]): PublicKey[] {
    const seen = new Map<string, PublicKey>()
    for (const tx of txs) for (const ix of tx.instructions) for (const key of ix.keys) if (key.isWritable) seen.set(key.pubkey.toBase58(), key.pubkey)
    return [...seen.values()].slice(0, 128)
}

export async function estimatePrice(connection: Connection, txs: Transaction[]): Promise<number> {
    const recent = await withRetry(() => connection.getRecentPrioritizationFees({ lockedWritableAccounts: writableAccounts(txs) }))
    return priorityPrice(recent.map((r) => r.prioritizationFee))
}

export function applyBudget(tx: Transaction, { units, price }: { units?: number; price: number }): Transaction {
    if (hasComputeBudget(tx)) return tx
    const budget = []
    if (units !== undefined) budget.push(ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit(units) }))
    if (price > 0) budget.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }))
    tx.instructions = [...budget, ...tx.instructions]
    return tx
}
