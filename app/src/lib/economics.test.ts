import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creatorTradingFeePercentage, economicsProblem, feeSplit, percentOfTrade } from '@meteortoll/core'
import economics from '../../../problems/economics.json'

const none = { treasurySharePercent: 0, launchFeeSol: 0 }

test('no treasury', () => {
    assert.deepEqual(feeSplit(none, 20), { protocol: 0.2, treasury: 0, bounty: 0.8 })
    assert.equal(creatorTradingFeePercentage(none), 100)
    assert.equal(percentOfTrade(feeSplit(none, 20).bounty), '0.8%')
})

test('treasury share', () => {
    const split = feeSplit({ treasurySharePercent: 20, launchFeeSol: 0 }, 20)
    assert.equal(split.protocol, 0.2)
    assert.equal(percentOfTrade(split.treasury), '0.16%')
    assert.equal(percentOfTrade(split.bounty), '0.64%')
    assert.ok(Math.abs(split.protocol + split.treasury + split.bounty - 1) < 1e-12)
    assert.equal(creatorTradingFeePercentage({ treasurySharePercent: 20, launchFeeSol: 0 }), 80)
})

test('invalid settings', () => {
    assert.equal(economicsProblem(none), null)
    assert.equal(economicsProblem({ treasurySharePercent: 50, launchFeeSol: 100 }), null)
    assert.match(economicsProblem({ treasurySharePercent: 51, launchFeeSol: 0 })!, /0 to 50/)
    assert.match(economicsProblem({ treasurySharePercent: 12.5, launchFeeSol: 0 })!, /whole number/)
    assert.match(economicsProblem({ treasurySharePercent: -1, launchFeeSol: 0 })!, /0 to 50/)
    assert.match(economicsProblem({ treasurySharePercent: 0, launchFeeSol: 0.0001 })!, /launchFeeSol/)
    assert.match(economicsProblem({ treasurySharePercent: 0, launchFeeSol: 101 })!, /launchFeeSol/)
})

test('checked-in settings', () => {
    for (const [cluster, settings] of Object.entries(economics)) assert.equal(economicsProblem(settings), null, cluster)
})

test('site figures', async () => {
    const { BOUNTY_SHARE, ECONOMICS, HAS_TREASURY, SPLIT } = await import('./economics')
    assert.equal(HAS_TREASURY, ECONOMICS.treasurySharePercent > 0)
    assert.ok(Math.abs(SPLIT.protocol + SPLIT.treasury + SPLIT.bounty - 1) < 1e-12)
    assert.match(BOUNTY_SHARE, /^\d+(\.\d+)?%$/)
})

test('window validation', async () => {
    const { launchWindowProblem, launchWindowText } = await import('@meteortoll/core')
    const window = { startingFeeBps: 5000, endingFeeBps: 100, numberOfPeriod: 24, totalDurationSlots: 360 }
    assert.equal(launchWindowProblem(window), null)
    assert.equal(launchWindowProblem(null), null)
    assert.equal(launchWindowProblem({ ...window, endingFeeBps: 50 }), 'launchWindow.endingFeeBps must be 100, the normal trading fee')
    assert.match(launchWindowProblem({ ...window, startingFeeBps: 100 })!, /above 100/)
    assert.match(launchWindowProblem({ ...window, startingFeeBps: 9901 })!, /at most 9900/)
    assert.match(launchWindowProblem({ ...window, totalDurationSlots: 361 })!, /whole multiple/)
    assert.equal(launchWindowText(window), '50% falling to 1% over about 2 minutes')
    assert.equal(launchWindowText({ ...window, totalDurationSlots: 120 }), '50% falling to 1% over about 48 seconds')
})

test('window per cluster', () => {
    assert.ok(economics.mainnet.launchWindow, 'mainnet has a launch window')
    assert.equal(economics.devnet.launchWindow, null)
})

test('fee bounds', () => {
    assert.equal(economicsProblem({ treasurySharePercent: 0, launchFeeSol: 0.001 }), null)
    assert.match(economicsProblem({ treasurySharePercent: 0, launchFeeSol: NaN })!, /launchFeeSol/)
    assert.match(economicsProblem({ treasurySharePercent: 0, launchFeeSol: -1 })!, /launchFeeSol/)
})

test('window bounds', async () => {
    const { launchWindowProblem, launchWindowText } = await import('@meteortoll/core')
    const window = { startingFeeBps: 9900, endingFeeBps: 100, numberOfPeriod: 1, totalDurationSlots: 1 }
    assert.equal(launchWindowProblem(window), null)
    assert.equal(launchWindowProblem({ ...window, numberOfPeriod: 1000, totalDurationSlots: 1000 }), null)
    assert.match(launchWindowProblem({ ...window, numberOfPeriod: 0 })!, /from 1 to 1000/)
    assert.match(launchWindowProblem({ ...window, numberOfPeriod: 1001, totalDurationSlots: 1001 })!, /from 1 to 1000/)
    assert.match(launchWindowProblem({ ...window, numberOfPeriod: 1.5, totalDurationSlots: 3 })!, /from 1 to 1000/)
    assert.match(launchWindowProblem({ ...window, numberOfPeriod: 24, totalDurationSlots: 0 })!, /whole multiple/)
    assert.match(launchWindowProblem({ ...window, totalDurationSlots: 1.5 })!, /whole multiple/)
    assert.equal(launchWindowText({ ...window, totalDurationSlots: 225 }), '99% falling to 1% over about 2 minutes')
})
