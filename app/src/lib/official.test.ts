import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { PROBLEM_SPACE, TOLL } from '@meteortoll/core'
import { assertOfficial, decodeProblem, ForeignProblemError, knownKinds, problemKey, ProblemNotFoundError } from './chain'
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

test('problem kinds', async () => {
    const { BorshAccountsCoder } = await import('@coral-xyz/anchor')
    const { default: BN } = await import('bn.js')
    const { tollIdl } = await import('@meteortoll/core')
    const coder = new BorshAccountsCoder(tollIdl as never)
    const key = () => Keypair.generate().publicKey
    const account = (kind: number) => ({
        launchpad: LAUNCHPAD,
        pool: key(),
        baseMint: key(),
        quoteMint: key(),
        baseVault: key(),
        quoteVault: key(),
        n1: 7,
        n2: 7,
        n3: 9,
        targetRank: 314,
        solver: null,
        solvedRank: 0,
        solverCommitSlot: new BN(0),
        solvedAtSlot: new BN(0),
        graceSlots: new BN(150),
        attempts: 0,
        pending: 0,
        bump: 255,
        kind,
        reserved: Array(64).fill(0),
    })
    const encode = async (kind: number) => {
        const data = Buffer.alloc(PROBLEM_SPACE)
        ;(await coder.encode('Problem', account(kind))).copy(data)
        return data
    }
    const connection = new Connection('http://localhost:1')
    assert.equal(decodeProblem('x', { owner: TOLL, data: await encode(0) }, connection).kind, 0)
    const unknown = await encode(1)
    assert.throws(() => decodeProblem('x', { owner: TOLL, data: unknown }, connection), ProblemNotFoundError)
})

test('listed kinds', () => {
    const rows = [0, 1, 0, 255].map((kind, at) => ({ at, account: { kind } }))
    assert.deepEqual(knownKinds(rows).map((row) => row.at), [0, 2])
})
