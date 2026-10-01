// Sending signed transactions and waiting for them without flooding the RPC.

import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { failureFromStatus } from '../errors'
import { applyBudget, estimatePrice } from '../fees'
import { withRetry } from '../rpc'

/// Sets payer, blockhash and a priority fee on transactions about to be signed together. They are
/// not simulated one by one (later ones depend on earlier ones landing), so each keeps the default
/// compute limit unless it sets its own budget.
export async function prepare(connection: Connection, txs: Transaction[], payer: PublicKey) {
    const price = await estimatePrice(connection, txs)
    const latest = await withRetry(() => connection.getLatestBlockhash('confirmed'))
    for (const tx of txs) {
        applyBudget(tx, { price })
        tx.recentBlockhash = latest.blockhash
        tx.feePayer = payer
    }
    return latest
}

/// Sends signed transactions and waits for them with batched status polls, which costs far
/// fewer RPC requests than one confirmation subscription per transaction. With `stopWhen`, sends
/// one at a time and stops as soon as the condition holds.
export async function sendAll(
    connection: Connection,
    signed: Transaction[],
    onProgress: (done: number) => void,
    { stopWhen }: { stopWhen?: () => Promise<boolean> } = {}
): Promise<string[]> {
    if (stopWhen) {
        const signatures: string[] = []
        for (const tx of signed) {
            if (await stopWhen()) break
            signatures.push(...(await sendBatch(connection, [tx], () => {})))
            onProgress(signatures.length)
        }
        return signatures
    }
    return sendBatch(connection, signed, onProgress)
}

async function sendBatch(connection: Connection, signed: Transaction[], onProgress: (done: number) => void): Promise<string[]> {
    const signatures: string[] = []
    const sentBy = new Map<string, Transaction>()
    for (const tx of signed) {
        const signature = await withRetry(() => connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 }))
        signatures.push(signature)
        sentBy.set(signature, tx)
        await new Promise((resolve) => setTimeout(resolve, 120))
    }
    const pending = new Set(signatures)
    while (pending.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        // Leaders drop transactions under load; resending the same signed bytes is harmless (the
        // runtime processes a signature once) and is how a dropped one still lands.
        for (const signature of pending) {
            await connection.sendRawTransaction(sentBy.get(signature)!.serialize(), { skipPreflight: true, maxRetries: 0 }).catch(() => undefined)
        }
        const list = [...pending]
        const { value } = await withRetry(() => connection.getSignatureStatuses(list))
        for (const [i, status] of value.entries()) {
            if (!status) continue
            if (status.err) {
                const failed = await connection.getTransaction(list[i], { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)
                const programs = sentBy.get(list[i])?.instructions.map((ix) => ix.programId) ?? []
                throw failureFromStatus(status.err, programs, failed?.meta?.logMessages ?? [], list[i])
            }
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') pending.delete(list[i])
        }
        onProgress(signatures.length - pending.size)
        // Expired means the blockhash they were signed with is gone: they can no longer land.
        const blockhash = sentBy.get([...pending][0] ?? '')?.recentBlockhash
        if (pending.size > 0 && blockhash && !(await withRetry(() => connection.isBlockhashValid(blockhash, { commitment: 'confirmed' }))).value) {
            // One last look: a transaction may have landed between the status poll and this check.
            const last = [...pending]
            const { value: final } = await withRetry(() => connection.getSignatureStatuses(last, { searchTransactionHistory: true }))
            const missing = last.filter((_, i) => !final[i] || final[i]!.err || !['confirmed', 'finalized'].includes(final[i]!.confirmationStatus ?? ''))
            if (missing.length > 0) throw new Error(`${missing.length} transactions expired before landing; continue to re-sign only the missing ones`)
            pending.clear()
            onProgress(signatures.length)
        }
    }
    return signatures
}

export async function waitForSlot(connection: Connection, slot: number) {
    while ((await withRetry(() => connection.getSlot('confirmed'))) < slot) await new Promise((resolve) => setTimeout(resolve, 600))
}
