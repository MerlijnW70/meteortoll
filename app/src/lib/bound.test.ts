import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorBound, errorBoundText } from './bound'
import { KNOWN_FORMATS } from './known'

test('matches core', () => {
    assert.equal(errorBound(7, 7, 9), 175)
    assert.equal(errorBound(9, 11, 13), 359)
})

test('formatting', () => {
    assert.equal(errorBoundText(7, 7, 9), '175/2⁶¹, about 7.6·10⁻¹⁷')
})

test('launch formats', () => {
    const P = 2 ** 61 - 1
    for (const format of KNOWN_FORMATS) {
        const [a, b, c] = format.n
        assert.ok(errorBound(a, b, c) / P < 1e-15, format.n.join('x'))
    }
})
