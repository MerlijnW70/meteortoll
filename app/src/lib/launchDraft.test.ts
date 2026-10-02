import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { KnownFormat } from './known'
import BN from 'bn.js'
import { statementProblem } from './launch'
import { draftFor, launchKind, targetNote, tokenName, tokenProblem, tokenSymbol, withTarget } from './launchDraft'

const record = { source: 'catalogue', url: 'https://example.invalid', asOf: '2026-09-30', ring: null }
const open: KnownFormat = { n: [2, 12, 15], naive: 360, bestKnown: { rank: 278, ...record } }
const held: KnownFormat = { n: [7, 7, 9], naive: 441, bestKnown: { rank: 315, ...record }, team: { rank: 314, coefficients: '{-1, 0, 1}', tool: 'search' } }

test('fresh draft', () => {
    assert.deepEqual(draftFor(open), { target: '277', name: '2x12x15 rank<=277', symbol: 'MM21215', named: false, firstBuy: '0' })
})

test('default name', () => {
    const moved = withTarget(open, draftFor(open), '270')
    assert.equal(moved.name, tokenName(open.n, 270))
    const named = { ...draftFor(open), name: 'my problem', named: true }
    assert.equal(withTarget(open, named, '270').name, 'my problem')
})

test('default symbol', () => {
    assert.equal(tokenSymbol([16, 16, 16]), 'MM161616')
    assert.ok(tokenSymbol([16, 16, 16, 16, 16]).length <= 10)
})

test('solved target', () => {
    for (const target of [278, 300]) assert.equal(targetNote(open, target)?.tone, 'warn')
})

test('demo target', () => {
    assert.equal(launchKind(held, 314), 'demo')
    assert.equal(launchKind(held, 313), 'open')
    assert.equal(launchKind(open, 277), 'open')
    assert.match(targetNote(held, 314)!.text, /disclosed demo/)
    assert.equal(targetNote(held, 313)!.tone, 'good')
})

test('target note', () => {
    assert.match(targetNote(open, 277)!.text, /new record/)
    assert.match(targetNote(open, 270)!.text, /^8 below the record/)
})

test('invalid target', () => {
    for (const target of [0, -1, 1.5, Number.NaN, 360]) assert.equal(targetNote(open, target), null)
})

test('token limits', () => {
    assert.equal(tokenProblem({ name: '2x12x15 rank<=277', symbol: 'MM21215' }), null)
    assert.match(tokenProblem({ name: '  ', symbol: 'A' })!, /name cannot be empty/)
    assert.match(tokenProblem({ name: 'x'.repeat(33), symbol: 'A' })!, /at most 32 bytes/)
    assert.match(tokenProblem({ name: 'é'.repeat(17), symbol: 'A' })!, /bytes/, 'counted in bytes, not characters')
    assert.match(tokenProblem({ name: 'ok', symbol: '' })!, /symbol cannot be empty/)
    assert.match(tokenProblem({ name: 'ok', symbol: 'ABCDEFGHIJK' })!, /1 to 10/)
})

test('token check matches launch', () => {
    const base = { n: [2, 12, 15] as [number, number, number], target: 277, firstBuy: new BN(0) }
    for (const [name, symbol] of [['2x12x15 rank<=277', 'MM21215'], ['x'.repeat(32), 'A'], ['é'.repeat(16), 'Z9']]) {
        assert.equal(tokenProblem({ name, symbol }), null)
        assert.equal(statementProblem({ ...base, name, symbol }), null)
    }
})
