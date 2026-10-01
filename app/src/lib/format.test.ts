import { test } from 'node:test'
import assert from 'node:assert/strict'
import BN from 'bn.js'
import { count, percentDown } from './format'
import { SLIPPAGE_BPS, withSlippage } from './trade'

test('a curve a hair short of full does not read as full', () => {
    // The devnet pool that stalled 8,295 lamports short of its 309,016,994 threshold.
    assert.equal(percentDown(309_008_699 / 309_016_994, 2), '99.99%')
    assert.equal(percentDown(1, 2), '100.00%')
    assert.equal(percentDown(0.16024, 1), '16.0%')
})

test('percentages stay within 0 and 100', () => {
    assert.equal(percentDown(1.2, 1), '100.0%')
    assert.equal(percentDown(-0.1, 1), '0.0%')
})

test('counts read in English whatever the browser', () => {
    assert.equal(count(20_803), '20,803')
})

test('slippage lowers the minimum output by the stated limit, rounding down', () => {
    assert.equal(withSlippage(new BN(10_000)).toString(), String(10_000 - SLIPPAGE_BPS))
    assert.equal(withSlippage(new BN(1)).toString(), '0')
})
