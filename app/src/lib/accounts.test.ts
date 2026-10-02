import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { problemPhase, type ProblemAccount } from '@meteortoll/core'

const u64 = (value: number) => ({ toNumber: () => value, toString: () => String(value) })
const problem = (solved: boolean) => ({ solver: solved ? Keypair.generate().publicKey : null, solvedAtSlot: u64(100), graceSlots: u64(50) }) as unknown as ProblemAccount

test('open problem', () => {
    assert.equal(problemPhase(problem(false), 500), 'open')
})

test('grace then solved', () => {
    assert.equal(problemPhase(problem(true), 60), 'grace')
    assert.equal(problemPhase(problem(true), 149), 'grace')
    assert.equal(problemPhase(problem(true), 150), 'solved')
    assert.equal(problemPhase(problem(true), 200), 'solved')
})

test('pending check', () => {
    const busy = { ...problem(true), pending: 1 } as ProblemAccount
    assert.equal(problemPhase(busy, 10_000), 'grace')
    assert.equal(problemPhase({ ...busy, pending: 0 }, 10_000), 'solved')
})

test('problem space', async () => {
    const { BorshAccountsCoder } = await import('@coral-xyz/anchor')
    const { PROBLEM_SPACE, tollIdl } = await import('@meteortoll/core')
    assert.equal(new BorshAccountsCoder(tollIdl as never).size('Problem'), PROBLEM_SPACE)
})
