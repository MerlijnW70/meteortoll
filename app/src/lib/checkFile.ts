// Reads a dropped scheme file and runs the browser verifier on it, refusing files the program
// would refuse anyway before spending any time parsing them.

import { encodeScheme, type FmmScheme, MAX_SCHEME_LEN, schemeHeader } from '@meteortoll/core'
import { count } from './format'
import { type Progress, sharedVerifier } from './verifier'

/// fmm JSON is far larger than its encoding; this bounds parsing work in the browser.
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/// The toll program's `MAX_SCHEME_LEN`, from its IDL.
export const MAX_SCHEME_BYTES = MAX_SCHEME_LEN

export interface Checked {
    scheme: Uint8Array
    file: string
    bytes: number
    header: { n1: number; n2: number; n3: number; rank: number }
    result: Progress
    millis: number
}

/// The same scheme with one coefficient negated (-128, which i8 cannot negate, becomes 127). The
/// coefficient is the first of a product whose three factors are all nonzero: changing it adds a
/// nonzero polynomial to the scheme side, so the copy fails at all but a negligible share of
/// points. A coefficient of a product with an all-zero factor would change nothing.
export function brokenScheme(scheme: Uint8Array): Uint8Array {
    const view = new DataView(scheme.buffer, scheme.byteOffset, scheme.byteLength)
    if (scheme.length < 7) throw new Error('the scheme is too short to hold a header')
    const rank = view.getUint32(3, true)
    let at = 7
    for (let r = 0; r < rank; r++) {
        const start = at
        const counts: number[] = []
        for (let factor = 0; factor < 3; factor++) {
            if (at + 2 > scheme.length) throw new Error('the scheme ends inside a factor')
            const count = view.getUint16(at, true)
            counts.push(count)
            at += 2 + count * 3
        }
        if (at > scheme.length) throw new Error('the scheme ends inside a factor')
        if (counts.every((count) => count > 0)) {
            const copy = Uint8Array.from(scheme)
            const value = start + 2 + 2
            const old = view.getInt8(value)
            copy[value] = (old === -128 ? 127 : -old) & 0xff
            return copy
        }
    }
    throw new Error('the scheme has no product with three nonzero factors')
}

export async function checkFile(file: File): Promise<Checked> {
    if (file.size > MAX_FILE_BYTES) throw new Error(`the file is ${(file.size / 2 ** 20).toFixed(1)} MB; files larger than ${MAX_FILE_BYTES / 2 ** 20} MB are not accepted`)
    const json = file.name.toLowerCase().endsWith('.json')
    const scheme = json ? encodeScheme(JSON.parse(await file.text()) as FmmScheme) : new Uint8Array(await file.arrayBuffer())
    if (scheme.length < 7) throw new Error('the file is too short to hold a scheme header')
    if (scheme.length > MAX_SCHEME_BYTES) throw new Error(`the encoded scheme is ${count(scheme.length)} bytes; the program accepts at most ${count(MAX_SCHEME_BYTES)}`)
    const header = schemeHeader(Buffer.from(scheme))
    const verifier = await sharedVerifier()
    const started = performance.now()
    const result = verifier.verify(scheme, crypto.getRandomValues(new Uint8Array(32)))
    return { scheme: Uint8Array.from(scheme), file: file.name, bytes: scheme.length, header, result, millis: performance.now() - started }
}
