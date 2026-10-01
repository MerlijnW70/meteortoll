import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combine, type Grid, random, schoolbook, strassen } from './strassen'

/// `x + 0` turns -0 into 0, which strict equality would otherwise tell apart.
const plain = (entries: Record<string, number>) => Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v + 0]))

const direct = (a: Grid, b: Grid) => ({
    c11: a[0][0] * b[0][0] + a[0][1] * b[1][0],
    c12: a[0][0] * b[0][1] + a[0][1] * b[1][1],
    c21: a[1][0] * b[0][0] + a[1][1] * b[1][0],
    c22: a[1][0] * b[0][1] + a[1][1] * b[1][1],
})

test('the explainer uses 8 and 7 products', () => {
    assert.equal(schoolbook.length, 8)
    assert.equal(strassen.length, 7)
})

test('both product lists multiply any 2×2 matrices correctly', () => {
    for (let i = 0; i < 500; i++) {
        const [a, b] = [random(), random()]
        assert.deepEqual(plain(combine(schoolbook, a, b)), plain(direct(a, b)))
        assert.deepEqual(plain(combine(strassen, a, b)), plain(direct(a, b)))
    }
})
