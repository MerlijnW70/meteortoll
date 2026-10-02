import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { commitment } from '@meteortoll/core'
import { makeReceipt, parseReceipt, RECEIPT_KIND, saltFrom } from './receipt'

const key = () => Keypair.generate().publicKey
const problem = key()
const solver = key()
const attempt = key()
const salt = Uint8Array.from({ length: 32 }, (_, i) => i * 7)
const scheme = Uint8Array.from([7, 7, 9, 58, 1, 0, 0, 1, 2, 3])
const onChain = commitment(problem, solver, salt, scheme)
const expected = { problem, solver, attempt, commitment: Array.from(onChain), scheme }
const receipt = () => makeReceipt({ cluster: 'devnet', problem, attempt, solver, salt, scheme, now: new Date('2026-10-02T00:00:00Z') })

test('round trip', () => {
    const back = parseReceipt(JSON.stringify(receipt()))
    assert.deepEqual(saltFrom(back, expected), salt)
})

test('mismatch', () => {
    assert.throws(() => saltFrom(receipt(), { ...expected, problem: key() }), /another problem/)
    assert.throws(() => saltFrom(receipt(), { ...expected, solver: key() }), /another wallet/)
    assert.throws(() => saltFrom(receipt(), { ...expected, attempt: key() }), /another attempt/)
    assert.throws(() => saltFrom(receipt(), { ...expected, scheme: Uint8Array.from([1, 2, 3]) }), /another scheme file/)
})

test('wrong salt', () => {
    const forged = { ...receipt(), salt: 'ff'.repeat(32) }
    assert.throws(() => saltFrom(forged, expected), /does not match the commitment/)
})

test('not a receipt', () => {
    assert.throws(() => parseReceipt('not json'), /not a commitment receipt/)
    assert.throws(() => parseReceipt(JSON.stringify({ kind: 'other' })), /not a commitment receipt/)
    assert.throws(() => parseReceipt(JSON.stringify({ ...receipt(), salt: 'xyz' })), /damaged/)
    assert.throws(() => parseReceipt(JSON.stringify({ ...receipt(), problem: 'nope' })), /not an address/)
    const missing: Partial<ReturnType<typeof receipt>> = receipt()
    delete missing.salt
    assert.throws(() => parseReceipt(JSON.stringify(missing)), /no salt/)
    assert.equal(parseReceipt(JSON.stringify(receipt())).kind, RECEIPT_KIND)
})
