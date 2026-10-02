import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowSlotsLeft } from './trade'

const window = { baseFeeMode: 1, firstFactor: 24, secondFactor: 15 }

test('slots left', () => {
    assert.equal(windowSlotsLeft(window, 1_000n, 1_000n), 360)
    assert.equal(windowSlotsLeft(window, 1_000n, 1_100n), 260)
    assert.equal(windowSlotsLeft(window, 1_000n, 1_360n), 0)
    assert.equal(windowSlotsLeft(window, 1_000n, 9_999n), 0)
})

test('no window', () => {
    assert.equal(windowSlotsLeft({ baseFeeMode: 0, firstFactor: 0, secondFactor: 0 }, 1_000n, 1_000n), 0)
    assert.equal(windowSlotsLeft({ baseFeeMode: 2, firstFactor: 24, secondFactor: 15 }, 1_000n, 1_000n), 0)
})
