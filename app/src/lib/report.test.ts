import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { utils } from '@coral-xyz/anchor'
import type { ErrorKind } from './errors'
import { cleanReport, LIMITS, scrub, worthReporting } from './report'

test('only our failures are reported, not the visitor’s choices or the network’s weather', () => {
    const reported: ErrorKind[] = ['program', 'unknown']
    const ignored: ErrorKind[] = ['cancelled', 'funds', 'slippage', 'busy', 'expired', 'network']
    for (const kind of reported) assert.equal(worthReporting(kind), true, kind)
    for (const kind of ignored) assert.equal(worthReporting(kind), false, kind)
})

test('a secret key never travels, in base58 or as a JSON array', () => {
    const secret = Keypair.generate().secretKey
    const base58 = utils.bytes.bs58.encode(secret)
    assert.equal(scrub(`failed with ${base58} in it`), 'failed with [redacted] in it')
    assert.equal(scrub(`key ${JSON.stringify(Array.from(secret))}`), 'key [redacted]')
})

test('addresses and signatures stay readable: they are public and needed to debug', () => {
    const address = Keypair.generate().publicKey.toBase58()
    assert.equal(scrub(`account ${address} not found`), `account ${address} not found`)
    assert.equal(scrub('array [1, 2, 3] is fine'), 'array [1, 2, 3] is fine')
})

test('a report is cut to size and its path loses query and fragment', () => {
    const stack = 'at frame (page.js:1:1)\n'.repeat(1_000)
    const report = cleanReport({ kind: 'action', message: 'word '.repeat(2_000), stack, path: '/solve?problem=abc#top', release: 'abc1234', cluster: 'devnet' })
    assert.ok(report)
    assert.equal(report.message.length, LIMITS.message)
    assert.equal(report.stack.length, LIMITS.stack)
    assert.equal(report.path, '/solve')
})

test('junk is not a report', () => {
    assert.equal(cleanReport(null), null)
    assert.equal(cleanReport('text'), null)
    assert.equal(cleanReport({ kind: 'action' }), null, 'no message')
    assert.equal(cleanReport({ kind: 'nonsense', message: 'm' }), null, 'unknown kind')
    assert.equal(cleanReport({ kind: 'crash', message: 'm', path: 'https://evil.example/x' })?.path, '/', 'a path must be one of ours')
    assert.equal(cleanReport({ kind: 'crash', message: 42 }), null, 'message must be text')
})
