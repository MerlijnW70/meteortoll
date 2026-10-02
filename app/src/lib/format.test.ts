import { test } from 'node:test'
import assert from 'node:assert/strict'
import BN from 'bn.js'
import { ago, count, percentDown } from './format'
import { SLIPPAGE_BPS, withSlippage } from './trade'

test('near-full curve', () => {
    assert.equal(percentDown(309_008_699 / 309_016_994, 2), '99.99%')
    assert.equal(percentDown(1, 2), '100.00%')
    assert.equal(percentDown(0.16024, 1), '16.0%')
})

test('percent clamp', () => {
    assert.equal(percentDown(1.2, 1), '100.0%')
    assert.equal(percentDown(-0.1, 1), '0.0%')
})

test('counts', () => {
    assert.equal(count(20_803), '20,803')
})

test('slippage', () => {
    assert.equal(withSlippage(new BN(10_000)).toString(), String(10_000 - SLIPPAGE_BPS))
    assert.equal(withSlippage(new BN(1)).toString(), '0')
})

test('time ago', () => {
    const now = 1_000_000
    assert.equal(ago(null, now), '')
    assert.equal(ago(now - 42, now), '42s')
    assert.equal(ago(now - 60, now), '1m')
    assert.equal(ago(now - 3 * 3600 - 5, now), '3h')
    assert.equal(ago(now - 2 * 86400, now), '2d')
    assert.equal(ago(now + 10, now), '0s')
})
