import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, problemStanding, standing, standingNote } from './classify'

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

const at = (target: number, change: { n?: number[]; best?: number; listed?: boolean; mainnet?: boolean } = {}) =>
    standing({ n: [2, 12, 15], target, best: 278, listed: true, mainnet: true, ...change })

test('open standing', () => {
    assert.equal(at(277), null)
    assert.equal(at(180), null)
    assert.equal(at(277, { listed: false, mainnet: false }), null)
})

test('answered', () => {
    assert.equal(at(278), 'answered')
    assert.equal(at(7, { n: [2, 2, 2], best: undefined }), 'answered')
    assert.match(standingNote('answered', [2, 12, 15], 278), /rank-278/)
    assert.match(standingNote('answered', [2, 2, 2]), /exactly 7/)
})

test('impossible', () => {
    assert.equal(at(179), 'impossible')
    assert.equal(at(179, { listed: false }), 'impossible')
    assert.equal(at(6, { n: [2, 2, 2] }), 'impossible')
    assert.match(standingNote('impossible', [2, 12, 15]), /at least 180/)
})

test('unreviewed', () => {
    assert.equal(at(277, { listed: false }), 'unreviewed')
    assert.equal(at(1000, { n: [12, 13, 16], best: undefined, listed: false }), 'unreviewed')
    assert.equal(at(1000, { n: [12, 13, 16], best: undefined, listed: false, mainnet: false }), null)
})

test('problem view', () => {
    const view = { account: { n1: 15, n2: 2, n3: 12, targetRank: 300 }, info: { bestKnown: { rank: 278 }, listed: true } } as never
    assert.equal(problemStanding(view, true), 'answered')
})
