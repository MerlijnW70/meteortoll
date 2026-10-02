import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { KnownFormat } from './known'
import { draftFor, launchKind, targetNote, tokenName, tokenSymbol, withTarget } from './launchDraft'

const record = { source: 'catalogue', url: 'https://example.invalid', asOf: '2026-09-30', ring: null }
const open: KnownFormat = { n: [2, 12, 15], naive: 360, bestKnown: { rank: 278, ...record } }
const held: KnownFormat = { n: [7, 7, 9], naive: 441, bestKnown: { rank: 315, ...record }, team: { rank: 314, coefficients: '{-1, 0, 1}', tool: 'search' } }

test('a fresh draft asks for one below the record, under the default token', () => {
    assert.deepEqual(draftFor(open), { target: '277', name: '2x12x15 rank<=277', symbol: 'MM21215', named: false, firstBuy: '0' })
})

test('the default name follows the target until the launcher names the token', () => {
    const moved = withTarget(open, draftFor(open), '270')
    assert.equal(moved.name, tokenName(open.n, 270))
    const named = { ...draftFor(open), name: 'my problem', named: true }
    assert.equal(withTarget(open, named, '270').name, 'my problem')
})

test('the default symbol keeps within the symbol limit', () => {
    assert.equal(tokenSymbol([16, 16, 16]), 'MM161616')
    assert.ok(tokenSymbol([16, 16, 16, 16, 16]).length <= 10)
})

test('a target at or above the record is refused as already solved', () => {
    for (const target of [278, 300]) assert.equal(targetNote(open, target)?.tone, 'warn')
})

test('a target the team already meets launches as a disclosed demo', () => {
    assert.equal(launchKind(held, 314), 'demo')
    assert.equal(launchKind(held, 313), 'open')
    assert.equal(launchKind(open, 277), 'open')
    assert.match(targetNote(held, 314)!.text, /disclosed demo/)
    assert.equal(targetNote(held, 313)!.tone, 'good')
})

test('open targets read as a record, or as how far below it they go', () => {
    assert.match(targetNote(open, 277)!.text, /new record/)
    assert.match(targetNote(open, 270)!.text, /^8 below the record/)
})

test('a target that is not a statement says nothing', () => {
    for (const target of [0, -1, 1.5, Number.NaN, 360]) assert.equal(targetNote(open, target), null)
})
