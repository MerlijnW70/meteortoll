import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProblemView } from './chain'
import { cardChip, cardHues, cardTitle } from './card'

const problem = (phase: ProblemView['phase'], n: [number, number, number], target: number, best?: number, listed = true) =>
    ({ phase, account: { n1: n[0], n2: n[1], n3: n[2], targetRank: target }, info: { bestKnown: best === undefined ? undefined : { rank: best }, listed } }) as unknown as ProblemView

test('open has no chip', () => {
    assert.equal(cardChip(problem('open', [7, 7, 9], 314, 315), true), null)
})

test('phase chips', () => {
    assert.deepEqual(cardChip(problem('solved', [7, 7, 9], 314, 315), false), { label: 'Solved', tone: 'muted' })
    assert.deepEqual(cardChip(problem('grace', [7, 7, 9], 314, 315), false), { label: 'Checking an answer', tone: 'accent' })
})

test('not winnable', () => {
    assert.equal(cardChip(problem('open', [7, 7, 9], 315, 315), false)?.label, 'Not winnable')
    assert.equal(cardChip(problem('open', [2, 2, 2], 6), false)?.label, 'Not winnable')
})

test('unreviewed', () => {
    assert.deepEqual(cardChip(problem('open', [7, 7, 9], 314, 315, false), true), { label: 'Not reviewed', tone: 'warn' })
    assert.equal(cardChip(problem('open', [7, 7, 9], 314, 315, false), false), null)
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
