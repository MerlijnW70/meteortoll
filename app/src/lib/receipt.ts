import { sha256 } from '@noble/hashes/sha256'
import { PublicKey } from '@solana/web3.js'
import { commitment } from '@meteortoll/core'

export const RECEIPT_KIND = 'meteortoll-commitment-receipt'

export interface Receipt {
    kind: typeof RECEIPT_KIND
    version: 1
    cluster: string
    problem: string
    attempt: string
    solver: string
    salt: string
    scheme: string
    created: string
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

export function makeReceipt(fields: { cluster: string; problem: PublicKey; attempt: PublicKey; solver: PublicKey; salt: Uint8Array; scheme: Uint8Array; now?: Date }): Receipt {
    return {
        kind: RECEIPT_KIND,
        version: 1,
        cluster: fields.cluster,
        problem: fields.problem.toBase58(),
        attempt: fields.attempt.toBase58(),
        solver: fields.solver.toBase58(),
        salt: hex(fields.salt),
        scheme: hex(sha256(fields.scheme)),
        created: (fields.now ?? new Date()).toISOString(),
    }
}

export function receiptFileName(receipt: Receipt) {
    return `meteortoll-receipt-${receipt.attempt.slice(0, 8)}.json`
}

export function parseReceipt(text: string): Receipt {
    let raw: Record<string, unknown>
    try {
        raw = JSON.parse(text)
    } catch {
        throw new Error('this file is not a commitment receipt')
    }
    if (raw?.kind !== RECEIPT_KIND || raw.version !== 1) throw new Error('this file is not a commitment receipt')
    for (const field of ['cluster', 'problem', 'attempt', 'solver', 'salt', 'scheme', 'created']) {
        if (typeof raw[field] !== 'string') throw new Error(`the receipt has no ${field}`)
    }
    if (!/^[0-9a-f]{64}$/.test(raw.salt as string) || !/^[0-9a-f]{64}$/.test(raw.scheme as string)) throw new Error('the receipt is damaged')
    for (const field of ['problem', 'attempt', 'solver']) {
        try {
            new PublicKey(raw[field] as string)
        } catch {
            throw new Error(`the receipt's ${field} is not an address`)
        }
    }
    return raw as unknown as Receipt
}

export function saltFrom(receipt: Receipt, expected: { problem: PublicKey; solver: PublicKey; attempt: PublicKey; commitment: Uint8Array | number[]; scheme: Uint8Array }): Uint8Array {
    if (receipt.problem !== expected.problem.toBase58()) throw new Error('this receipt is for another problem')
    if (receipt.solver !== expected.solver.toBase58()) throw new Error('this receipt is for another wallet')
    if (receipt.attempt !== expected.attempt.toBase58()) throw new Error('this receipt is for another attempt')
    if (receipt.scheme !== hex(sha256(expected.scheme))) throw new Error('this receipt is for another scheme file: drop the file you committed')
    const salt = Uint8Array.from(Buffer.from(receipt.salt, 'hex'))
    const recomputed = commitment(expected.problem, expected.solver, salt, expected.scheme)
    if (!Buffer.from(recomputed).equals(Buffer.from(Uint8Array.from(expected.commitment)))) throw new Error('this receipt does not match the commitment on-chain')
    return salt
}

export function downloadReceipt(receipt: Receipt) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = receiptFileName(receipt)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
