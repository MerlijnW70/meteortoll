// Simulate before asking the wallet, and treat a confirmed-but-failed transaction as a failure.

import type { SendTransactionOptions } from '@solana/wallet-adapter-base'
import { type BlockhashWithExpiryBlockHeight, type Connection, type PublicKey, type Transaction, VersionedTransaction } from '@solana/web3.js'
import { failureFromStatus, ProgramFailure } from './errors'
import { withRetry } from './rpc'

export type WalletSend = (tx: Transaction, connection: Connection, options?: SendTransactionOptions) => Promise<string>

const programIds = (tx: Transaction) => tx.instructions.map((ix) => ix.programId)

/// Runs the transaction against current state without signatures. A transaction that would fail
/// never reaches the wallet; its decoded reason is thrown instead.
export async function simulateOrThrow(connection: Connection, tx: Transaction): Promise<void> {
    const simulated = await withRetry(() =>
        connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
            sigVerify: false,
            replaceRecentBlockhash: true,
            commitment: 'confirmed',
        })
    )
    if (simulated.value.err) throw failureFromStatus(simulated.value.err, programIds(tx), simulated.value.logs ?? [])
}

async function logsFor(connection: Connection, signature: string): Promise<string[]> {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)
    return tx?.meta?.logMessages ?? []
}

/// Waits for a signature and throws a decoded failure if it landed with an error.
export async function confirmOrThrow(connection: Connection, tx: Transaction, signature: string, latest: BlockhashWithExpiryBlockHeight) {
    const result = await withRetry(() => connection.confirmTransaction({ signature, ...latest }, 'confirmed'))
    if (result.value.err) throw failureFromStatus(result.value.err, programIds(tx), await logsFor(connection, signature), signature)
    return signature
}

/// Prepares, simulates, has the wallet sign and send, and confirms one transaction.
export async function sendWithWallet(
    connection: Connection,
    tx: Transaction,
    owner: PublicKey,
    send: WalletSend,
    options?: SendTransactionOptions
): Promise<string> {
    const latest = await withRetry(() => connection.getLatestBlockhash('confirmed'))
    tx.recentBlockhash = latest.blockhash
    tx.feePayer = owner
    await simulateOrThrow(connection, tx)
    const signature = await send(tx, connection, options)
    return confirmOrThrow(connection, tx, signature, latest)
}

export { ProgramFailure }
