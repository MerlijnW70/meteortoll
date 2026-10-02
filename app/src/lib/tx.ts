import type { SendTransactionOptions } from '@solana/wallet-adapter-base'
import { type BlockhashWithExpiryBlockHeight, type Connection, type PublicKey, type Transaction, VersionedTransaction } from '@solana/web3.js'
import { failureFromStatus, ProgramFailure } from './errors'
import { applyBudget, estimatePrice, hasComputeBudget } from './fees'
import { withRetry } from './rpc'

export type WalletSend = (tx: Transaction, connection: Connection, options?: SendTransactionOptions) => Promise<string>

const programIds = (tx: Transaction) => tx.instructions.map((ix) => ix.programId)

export async function simulateOrThrow(connection: Connection, tx: Transaction): Promise<number | undefined> {
    const simulated = await withRetry(() =>
        connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
            sigVerify: false,
            replaceRecentBlockhash: true,
            commitment: 'confirmed',
        })
    )
    if (simulated.value.err) throw failureFromStatus(simulated.value.err, programIds(tx), simulated.value.logs ?? [])
    return simulated.value.unitsConsumed
}

async function logsFor(connection: Connection, signature: string): Promise<string[]> {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)
    return tx?.meta?.logMessages ?? []
}

export async function confirmOrThrow(connection: Connection, tx: Transaction, signature: string, latest: BlockhashWithExpiryBlockHeight) {
    const result = await withRetry(() => connection.confirmTransaction({ signature, ...latest }, 'confirmed'))
    if (result.value.err) throw failureFromStatus(result.value.err, programIds(tx), await logsFor(connection, signature), signature)
    return signature
}

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
    const units = await simulateOrThrow(connection, tx)
    if (!hasComputeBudget(tx)) applyBudget(tx, { units, price: await estimatePrice(connection, [tx]) })
    const signature = await send(tx, connection, options)
    return confirmOrThrow(connection, tx, signature, latest)
}

export { ProgramFailure }
