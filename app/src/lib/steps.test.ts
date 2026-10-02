import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentStep, isClaimed, ORDER, type Step, stepState } from '../components/solve/steps'

const states = (current: Step, failed: boolean, claimed: boolean) => ORDER.map((step) => stepState(step, current, failed, claimed))

test('new solver', () => {
    assert.equal(currentStep(null, false, false), 'commit')
    assert.deepEqual(states('commit', false, false), ['current', 'todo', 'todo', 'todo', 'todo', 'todo'])
})

test('status steps', () => {
    assert.equal(currentStep('committed', false, false), 'upload')
    assert.equal(currentStep('revealed', false, false), 'verify')
    assert.equal(currentStep('holds', true, false), 'grace')
    assert.equal(currentStep('holds', true, true), 'claim')
})

test('after claim', () => {
    const step = currentStep(null, true, true)
    assert.equal(step, 'claim')
    assert.equal(isClaimed(null, true, false), true)
    assert.deepEqual(states(step, false, isClaimed(null, true, false)), ['done', 'done', 'done', 'done', 'done', 'done'])
})

test('pending claim', () => {
    assert.equal(isClaimed('holds', true, true), true)
    assert.equal(isClaimed('holds', true, false), false)
})

test('other winner', () => {
    assert.equal(isClaimed(null, false, false), false)
    assert.equal(currentStep(null, false, true), 'commit')
})

test('failed check', () => {
    assert.deepEqual(states('claim', true, false), ['done', 'done', 'done', 'failed', 'done', 'current'])
})
