import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { encodeScheme, type FmmScheme } from '@meteortoll/core'
import { brokenScheme } from './checkFile'
import { Verifier } from './verifier'

const read = (path: string) => new Uint8Array(readFileSync(new URL(path, import.meta.url)))
const sample = read('../../public/samples/7x7x9-rank314.bin')
const verifier = Verifier.load(read('../../public/verifier.wasm'))
const seed = () => webcrypto.getRandomValues(new Uint8Array(32))

function encode(n: [number, number, number], products: [number, number][][][]): Uint8Array {
    const bytes = [...n, ...new Uint8Array(new Uint32Array([products.length]).buffer)]
    for (const factors of products) {
        for (const entries of factors) {
            bytes.push(entries.length & 0xff, entries.length >> 8)
            for (const [index, value] of entries) bytes.push(index & 0xff, index >> 8, value & 0xff)
        }
    }
    return Uint8Array.from(bytes)
}

const differing = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i])

test('sample matches fixture', () => {
    assert.deepEqual(sample, read('../../../tests/fixtures/7x7x9_m314_ZT.bin'))
})

test('sample holds', async () => {
    assert.equal((await verifier).verify(sample, seed()).verdict, 'holds')
})

test('broken sample', async () => {
    const broken = brokenScheme(sample)
    const changed = differing(sample, broken)
    assert.equal(changed.length, 1)
    assert.equal((broken[changed[0]] << 24) >> 24, -((sample[changed[0]] << 24) >> 24))
    assert.equal((await verifier).verify(broken, seed()).verdict, 'fails')
})

test('break skips zero factor', () => {
    const scheme = encode([1, 1, 1], [
        [[[0, 1]], [], [[0, 1]]],
        [[[0, 1]], [[0, 1]], [[0, 1]]],
    ])
    const changed = differing(scheme, brokenScheme(scheme))
    assert.deepEqual(changed, [7 + 5 + 2 + 5 + 2 + 2])
})

test('break -128', () => {
    const scheme = encode([1, 1, 1], [[[[0, -128]], [[0, 1]], [[0, 1]]]])
    const broken = brokenScheme(scheme)
    assert.equal(broken[differing(scheme, broken)[0]], 127)
})

test('break refuses', () => {
    assert.throws(() => brokenScheme(encode([1, 1, 1], [[[[0, 1]], [], [[0, 1]]]])), /no product with three nonzero factors/)
    assert.throws(() => brokenScheme(sample.subarray(0, 20)), /ends inside a factor/)
    assert.throws(() => brokenScheme(sample.subarray(0, 3)), /too short/)
})

test('json example', async () => {
    const json = JSON.parse(readFileSync(new URL('../../public/samples/strassen-2x2x2.json', import.meta.url), 'utf8')) as FmmScheme
    assert.equal((await verifier).verify(encodeScheme(json), seed()).verdict, 'holds')
})

test('untransposed c', async () => {
    const json = JSON.parse(readFileSync(new URL('../../public/samples/strassen-2x2x2.json', import.meta.url), 'utf8')) as FmmScheme
    const untransposed = { ...json, w: json.w.map(([c11, c21, c12, c22]) => [c11, c12, c21, c22]) }
    assert.equal((await verifier).verify(encodeScheme(untransposed), seed()).verdict, 'fails')
})
