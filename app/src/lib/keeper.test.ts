import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, PublicKey } from '@solana/web3.js'
import { ATTEMPT_STATUS_OFFSET, ATTEMPT_SUBMISSION_OFFSET, checkableProblems, pendingChecks, REVEALED } from './keeper'

const key = () => Keypair.generate().publicKey

function attempt(problem: PublicKey, submission: PublicKey, status: number): Uint8Array {
    const data = new Uint8Array(8 + 32 + 32 + 32 + 8 + 32 + 8 + 1 + 60 + 8 + 1)
    data.set(problem.toBytes(), 8)
    data.set(submission.toBytes(), ATTEMPT_SUBMISSION_OFFSET)
    data[ATTEMPT_STATUS_OFFSET] = status
    return data
}

test('revealed attempts', () => {
    const ours = key()
    const submission = key()
    const pubkey = key()
    const found = pendingChecks([{ pubkey, data: attempt(ours, submission, REVEALED) }], new Set([ours.toBase58()]))
    assert.equal(found.length, 1)
    assert.ok(found[0].attempt.equals(pubkey) && found[0].problem.equals(ours) && found[0].submission.equals(submission))
})

test('other attempts', () => {
    const ours = key()
    const rows = [
        { pubkey: key(), data: attempt(ours, key(), 0) },
        { pubkey: key(), data: attempt(ours, key(), 2) },
        { pubkey: key(), data: attempt(ours, key(), 3) },
        { pubkey: key(), data: attempt(key(), key(), REVEALED) },
        { pubkey: key(), data: new Uint8Array(40) },
    ]
    assert.deepEqual(pendingChecks(rows, new Set([ours.toBase58()])), [])
})

test('offsets', () => {
    assert.equal(ATTEMPT_SUBMISSION_OFFSET, 112)
    assert.equal(ATTEMPT_STATUS_OFFSET, 152)
})

test('finalized problems', () => {
    const [open, grace, solved] = [key(), key(), key()].map((k) => k.toBase58())
    const checkable = checkableProblems([
        { address: open, phase: 'open' },
        { address: grace, phase: 'grace' },
        { address: solved, phase: 'solved' },
    ])
    assert.deepEqual([...checkable].sort(), [open, grace].sort())
    const stale = { pubkey: key(), data: attempt(new PublicKey(solved), key(), REVEALED) }
    assert.deepEqual(pendingChecks([stale], checkable), [])
})
