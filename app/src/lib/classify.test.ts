import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './classify'

const team = { rank: 833, coefficients: '{-1, 0, 1}', tool: 'fmm' }

test('solvable is demo', () => {
    const c = classify(undefined, team, 834)
    assert.equal(c.kind, 'demo')
    assert.equal(c.teamMeetsTarget, true)
    assert.match(c.demoNote ?? '', /rank-833 .* not a public bounty/)
})

test('target at team rank', () => {
    assert.equal(classify(undefined, team, 833).kind, 'demo')
})

test('target below record', () => {
    const c = classify(undefined, team, 832)
    assert.deepEqual(c, { kind: 'open', demoNote: undefined, teamMeetsTarget: false })
})

test('no team record', () => {
    assert.equal(classify(undefined, undefined, 834).kind, 'open')
})

test('catalog consistency', () => {
    assert.equal(classify({ kind: 'open' }, team, 834).kind, 'demo')
})

test('curated note', () => {
    const c = classify({ kind: 'demo', demoNote: 'Funded by the team.' }, undefined, 10)
    assert.equal(c.kind, 'demo')
    assert.equal(c.demoNote, 'Funded by the team.')
})

test('open has no note', () => {
    assert.equal(classify({ kind: 'open', demoNote: 'stale' }, undefined, 10).demoNote, undefined)
})
