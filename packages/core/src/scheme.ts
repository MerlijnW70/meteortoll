// fmm scheme JSON to the sparse byte format of the verifier core (`src/scheme.rs`), and the
// commitment the toll program checks at reveal.

import { sha256 } from '@noble/hashes/sha256'
import type { PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

export const COMMIT_DOMAIN = Buffer.from('meteortoll/commit/v1')

export interface FmmScheme {
    n: [number, number, number]
    z2?: boolean
    u: (number | string)[][]
    v: (number | string)[][]
    w: (number | string)[][]
}

function coefficient(raw: number | string): number {
    const text = String(raw)
    if (text.includes('/')) throw new Error(`rational coefficient ${text} is not accepted`)
    const value = Number(text)
    if (!Number.isInteger(value) || value < -128 || value > 127) {
        throw new Error(`coefficient ${text} does not fit the i8 encoding`)
    }
    return value
}

function factor(row: (number | string)[], length: number): Buffer {
    if (row.length !== length) throw new Error(`row has ${row.length} entries, want ${length}`)
    const entries: Buffer[] = []
    row.forEach((raw, index) => {
        const value = coefficient(raw)
        if (value === 0) return
        const entry = Buffer.alloc(3)
        entry.writeUInt16LE(index, 0)
        entry.writeInt8(value, 2)
        entries.push(entry)
    })
    const count = Buffer.alloc(2)
    count.writeUInt16LE(entries.length, 0)
    return Buffer.concat([count, ...entries])
}

export function encodeScheme(scheme: FmmScheme): Buffer {
    const [n1, n2, n3] = scheme.n
    if (scheme.z2) throw new Error('schemes over Z2 are not accepted')
    const rank = scheme.u.length
    if (scheme.v.length !== rank || scheme.w.length !== rank) throw new Error('u, v, w have different ranks')
    const header = Buffer.alloc(7)
    header.writeUInt8(n1, 0)
    header.writeUInt8(n2, 1)
    header.writeUInt8(n3, 2)
    header.writeUInt32LE(rank, 3)
    const parts: Buffer[] = [header]
    for (let r = 0; r < rank; r++) {
        parts.push(factor(scheme.u[r], n1 * n2), factor(scheme.v[r], n2 * n3), factor(scheme.w[r], n3 * n1))
    }
    return Buffer.concat(parts)
}

export function schemeHeader(encoded: Buffer) {
    return { n1: encoded[0], n2: encoded[1], n3: encoded[2], rank: encoded.readUInt32LE(3) }
}

export function commitment(problem: PublicKey, solver: PublicKey, salt: Uint8Array, scheme: Uint8Array): Buffer {
    const hash = sha256.create()
    for (const part of [COMMIT_DOMAIN, problem.toBuffer(), solver.toBuffer(), salt, scheme]) hash.update(part)
    return Buffer.from(hash.digest())
}

/// Work units the on-chain check spends on a scheme, the unit of `verify`'s budget: each product
/// costs its stored coefficients, at least one. The direct side runs with the last product.
export function schemeWork(encoded: Uint8Array): number {
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength)
    const rank = view.getUint32(3, true)
    let at = 7
    let work = 0
    for (let product = 0; product < rank; product++) {
        let cost = 0
        for (let factor = 0; factor < 3; factor++) {
            const count = view.getUint16(at, true)
            cost += count
            at += 2 + count * 3
        }
        work += Math.max(1, cost)
    }
    return work
}

/// Verify calls a scheme needs at the program's budget: a call folds in products up to its budget,
/// and always at least one.
export function verifyCalls(work: number, budget: number): number {
    return Math.max(1, Math.ceil(work / budget))
}
