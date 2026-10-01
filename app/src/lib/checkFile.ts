// Reads a dropped scheme file and runs the browser verifier on it, refusing files the program
// would refuse anyway before spending any time parsing them.

import { encodeScheme, type FmmScheme, schemeHeader } from '@meteortoll/core'
import { type Progress, sharedVerifier } from './verifier'

/// fmm JSON is far larger than its encoding; this bounds parsing work in the browser.
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/// The toll program's `MAX_SCHEME_LEN`.
export const MAX_SCHEME_BYTES = 1 << 20

export interface Checked {
    scheme: Uint8Array
    file: string
    bytes: number
    header: { n1: number; n2: number; n3: number; rank: number }
    result: Progress
    millis: number
}

export async function checkFile(file: File): Promise<Checked> {
    if (file.size > MAX_FILE_BYTES) throw new Error(`the file is ${(file.size / 2 ** 20).toFixed(1)} MB; files larger than ${MAX_FILE_BYTES / 2 ** 20} MB are not accepted`)
    const json = file.name.toLowerCase().endsWith('.json')
    const scheme = json ? encodeScheme(JSON.parse(await file.text()) as FmmScheme) : new Uint8Array(await file.arrayBuffer())
    if (scheme.length < 7) throw new Error('the file is too short to hold a scheme header')
    if (scheme.length > MAX_SCHEME_BYTES) throw new Error(`the encoded scheme is ${scheme.length.toLocaleString()} bytes; the program accepts at most ${MAX_SCHEME_BYTES.toLocaleString()}`)
    const header = schemeHeader(Buffer.from(scheme))
    const verifier = await sharedVerifier()
    const started = performance.now()
    const result = verifier.verify(scheme, crypto.getRandomValues(new Uint8Array(32)))
    return { scheme: Uint8Array.from(scheme), file: file.name, bytes: scheme.length, header, result, millis: performance.now() - started }
}
