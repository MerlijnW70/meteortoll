import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentStep, isClaimed, ORDER, type Step, stepState } from '../components/solve/steps'

const states = (current: Step, failed: boolean, claimed: boolean) => ORDER.map((step) => stepState(step, current, failed, claimed))

test('a new solver starts at commit', () => {
    assert.equal(currentStep(null, false, false), 'commit')
    assert.deepEqual(states('commit', false, false), ['current', 'todo', 'todo', 'todo', 'todo', 'todo'])
})

test('each on-chain status moves the flow on', () => {
    assert.equal(currentStep('committed', false, false), 'upload')
    assert.equal(currentStep('revealed', false, false), 'verify')
    assert.equal(currentStep('holds', true, false), 'grace')
    assert.equal(currentStep('holds', true, true), 'claim')
})

test('after claiming, the closed attempt still reads as a finished solve', () => {
    // Claiming closes the attempt account: the status is gone, the win is not.
    const step = currentStep(null, true, true)
    assert.equal(step, 'claim')
    assert.equal(isClaimed(null, true, false), true)
    assert.deepEqual(states(step, false, isClaimed(null, true, false)), ['done', 'done', 'done', 'done', 'done', 'done'])
})

test('a claim sent in this session counts before the attempt disappears', () => {
    assert.equal(isClaimed('holds', true, true), true)
    assert.equal(isClaimed('holds', true, false), false)
})

test('someone else winning is not a claim of yours', () => {
    assert.equal(isClaimed(null, false, false), false)
    assert.equal(currentStep(null, false, true), 'commit')
})

test('a failed check marks verify, not the steps around it', () => {
    assert.deepEqual(states('claim', true, false), ['done', 'done', 'done', 'failed', 'done', 'current'])
})
