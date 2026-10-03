import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { PROBLEM_SPACE, TOLL } from '@meteortoll/core'
import { assertOfficial, decodeProblem, ForeignProblemError, problemKey, ProblemNotFoundError } from './chain'
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

test('foreign owner', () => {
    const connection = new Connection('http://localhost:1')
    const data = Buffer.alloc(PROBLEM_SPACE)
    assert.throws(() => decodeProblem('x', { owner: PublicKey.unique(), data }, connection), ProblemNotFoundError)
    assert.throws(() => decodeProblem('x', null, connection), ProblemNotFoundError)
    assert.throws(() => decodeProblem('x', { owner: TOLL, data: Buffer.alloc(PROBLEM_SPACE - 1) }, connection), ProblemNotFoundError)
    assert.throws(() => decodeProblem('x', { owner: TOLL, data }, connection), ProblemNotFoundError)
})

test('bad address', () => {
    assert.throws(() => problemKey('not-a-key'), ProblemNotFoundError)
    assert.equal(problemKey(TOLL.toBase58()).toBase58(), TOLL.toBase58())
})
