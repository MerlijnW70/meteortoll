import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { assertOfficial, ForeignProblemError } from './chain'
import { LAUNCHPAD } from './config'

test('own launchpad', () => {
    assert.doesNotThrow(() => assertOfficial('p', { launchpad: LAUNCHPAD }))
})

test('other launchpad', () => {
    const other = Keypair.generate().publicKey
    assert.throws(
        () => assertOfficial('p', { launchpad: other }),
        (error: unknown) => error instanceof ForeignProblemError && error.launchpad === other.toBase58() && error.address === 'p'
    )
})
