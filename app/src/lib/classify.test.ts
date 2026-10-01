import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './classify'

const team = { rank: 833, coefficients: '{-1, 0, 1}', tool: 'fmm' }

test('a problem the team can already solve is a disclosed demo, even uncurated', () => {
    const c = classify(undefined, team, 834)
    assert.equal(c.kind, 'demo')
    assert.equal(c.teamMeetsTarget, true)
    assert.match(c.demoNote ?? '', /rank-833 .* not a public bounty/)
})

test('the target at exactly the team rank still counts as met', () => {
    assert.equal(classify(undefined, team, 833).kind, 'demo')
})

test('a target below the team record is a public bounty', () => {
    const c = classify(undefined, team, 832)
    assert.deepEqual(c, { kind: 'open', demoNote: undefined, teamMeetsTarget: false })
})

test('no team record means a public bounty', () => {
    assert.equal(classify(undefined, undefined, 834).kind, 'open')
})

test('the catalog cannot list a problem the team meets as open', () => {
    assert.equal(classify({ kind: 'open' }, team, 834).kind, 'demo')
})

test("a curated demo keeps the catalog's own note", () => {
    const c = classify({ kind: 'demo', demoNote: 'Funded by the team.' }, undefined, 10)
    assert.equal(c.kind, 'demo')
    assert.equal(c.demoNote, 'Funded by the team.')
})

test('an open problem carries no demo note', () => {
    assert.equal(classify({ kind: 'open', demoNote: 'stale' }, undefined, 10).demoNote, undefined)
})
