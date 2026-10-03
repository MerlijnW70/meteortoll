import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProblemView } from './chain'
import { cardChip, cardHues, cardTitle, colLight, mixHue, randomLook, rowLight, shareState } from './card'

const problem = (phase: ProblemView['phase'], n: [number, number, number], target: number, best?: number, listed = true) =>
    ({ phase, account: { n1: n[0], n2: n[1], n3: n[2], targetRank: target }, info: { bestKnown: best === undefined ? undefined : { rank: best }, listed } }) as unknown as ProblemView

test('open is live', () => {
    assert.deepEqual(cardChip(problem('open', [7, 7, 9], 314, 315), true), { label: 'Live', tone: 'good', live: true })
})

test('phase chips', () => {
    assert.deepEqual(cardChip(problem('solved', [7, 7, 9], 314, 315), false), { label: 'Solved', tone: 'good', live: true })
    assert.deepEqual(cardChip(problem('grace', [7, 7, 9], 314, 315), false), { label: 'Checking an answer', tone: 'accent', live: true })
})

test('not winnable', () => {
    assert.deepEqual(cardChip(problem('open', [7, 7, 9], 315, 315), false), { label: 'Not winnable', tone: 'warn', live: false })
    assert.equal(cardChip(problem('open', [2, 2, 2], 6), false).label, 'Not winnable')
})

test('unreviewed', () => {
    assert.deepEqual(cardChip(problem('open', [7, 7, 9], 314, 315, false), true), { label: 'Not reviewed', tone: 'warn', live: false })
    assert.equal(cardChip(problem('open', [7, 7, 9], 314, 315, false), false).label, 'Live')
})

test('hues', () => {
    assert.deepEqual(cardHues({ n1: 7, n2: 7, n3: 9, targetRank: 314 }), [(7 * 47 + 7 * 89 + 9 * 131 + 314 * 7) % 360, ((7 * 47 + 7 * 89 + 9 * 131 + 314 * 7) % 360 + 70) % 360])
    assert.notDeepEqual(cardHues({ n1: 2, n2: 12, n3: 15, targetRank: 277 }), cardHues({ n1: 4, n2: 11, n3: 15, targetRank: 448 }))
    for (const h of cardHues({ n1: 99, n2: 99, n3: 99, targetRank: 9_999 })) assert.ok(h >= 0 && h < 360)
})

test('title', () => {
    assert.equal(cardTitle({ n1: 7, n2: 7, n3: 9 }), '7×7 times 7×9')
    assert.equal(cardTitle({ n1: 2, n2: 12, n3: 15 }), '2×12 times 12×15')
})

test('random look', () => {
    const values = [0.5, 0, 0.999]
    const look = randomLook(() => values.shift()!)
    assert.deepEqual(look, { a: 180, b: 270, seed: 999 })
    for (let i = 0; i < 50; i++) {
        const { a, b } = randomLook()
        const apart = (b - a + 360) % 360
        assert.ok(apart >= 90 && apart < 180)
    }
})

test('mix hue', () => {
    assert.equal(mixHue(350, 10, 0.5), 0)
    assert.equal(mixHue(10, 350, 0.5), 0)
    assert.equal(mixHue(100, 200, 0), 100)
    assert.equal(mixHue(100, 200, 1), 200)
    assert.equal(mixHue(0, 180, 0.5), 270)
})

test('light range', () => {
    for (let i = 0; i < 40; i++) {
        for (const l of [rowLight(i, 999), colLight(i, 999)]) assert.ok(l >= 46 && l < 68)
    }
})

test('share states', () => {
    assert.equal(shareState(problem('open', [7, 7, 9], 314, 315), false), 'prize')
    assert.equal(shareState(problem('grace', [7, 7, 9], 314, 315), false), 'review')
    assert.equal(shareState(problem('solved', [7, 7, 9], 314, 315), false), 'solved')
    assert.equal(shareState(problem('open', [7, 7, 9], 315, 315), false), 'notWinnable')
    assert.equal(shareState(problem('open', [7, 7, 9], 314, 315, false), true), 'unreviewed')
    assert.equal(shareState({ ...problem('open', [7, 7, 9], 314, 315), info: { kind: 'demo', listed: true, bestKnown: { rank: 315 } } } as never, false), 'demo')
})
