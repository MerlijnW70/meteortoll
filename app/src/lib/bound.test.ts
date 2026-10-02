import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorBound, errorBoundText } from './bound'
import { KNOWN_FORMATS } from './known'

test('the bound matches the verifier core for the same shapes', () => {
    // tests/facts.rs asserts the same numbers from check::error_bound.
    assert.equal(errorBound(7, 7, 9), 175)
    assert.equal(errorBound(9, 11, 13), 359)
})

test('the bound reads as a fraction of 2⁶¹ and a power of ten', () => {
    assert.equal(errorBoundText(7, 7, 9), '175/2⁶¹, about 7.6·10⁻¹⁷')
})

test('every format the Launch page offers is below one in 10¹⁵', () => {
    const P = 2 ** 61 - 1
    for (const format of KNOWN_FORMATS) {
        const [a, b, c] = format.n
        assert.ok(errorBound(a, b, c) / P < 1e-15, format.n.join('x'))
    }
})
