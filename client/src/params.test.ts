import { test } from 'node:test'
import assert from 'node:assert/strict'
import { launchParams } from './params'

const sol = (lamports: { toString(): string }) => Number(lamports.toString()) / 1e9
const threshold = (profile: Parameters<typeof launchParams>[0]) => sol((launchParams(profile) as unknown as { migrationQuoteThreshold: { toString(): string } }).migrationQuoteThreshold)

test('mainnet graduation', () => {
    const needed = threshold('mainnet')
    console.log(`fact: mainnet graduation after ${needed.toFixed(2)} SOL`)
    assert.ok(needed > 10 && needed < 20, `${needed} SOL`)
})

test('devnet graduation', () => {
    assert.ok(threshold('devnet') < 0.5)
})

test('creator fees locked', () => {
    const p = launchParams('mainnet') as unknown as Record<string, unknown>
    assert.equal(p.creatorTradingFeePercentage, 100)
    assert.equal(p.creatorPermanentLockedLiquidityPercentage, 100)
    assert.equal(p.partnerLiquidityPercentage, 0)
    assert.equal(p.creatorLiquidityPercentage, 0)
})

test('treasury config', () => {
    const none = launchParams('mainnet') as unknown as { creatorTradingFeePercentage: number; poolCreationFee: { toString(): string } }
    assert.equal(none.creatorTradingFeePercentage, 100)
    assert.equal(none.poolCreationFee.toString(), '0')
    const set = launchParams('mainnet', { treasurySharePercent: 20, launchFeeSol: 0.05 }) as unknown as typeof none
    assert.equal(set.creatorTradingFeePercentage, 80)
    assert.equal(set.poolCreationFee.toString(), '50000000')
})

test('invalid settings', () => {
    assert.throws(() => launchParams('mainnet', { treasurySharePercent: 60, launchFeeSol: 0 }), /economics\.json/)
    assert.throws(() => launchParams('mainnet', { treasurySharePercent: 0, launchFeeSol: 0.0001 }), /economics\.json/)
})

test('launch window', () => {
    const window = { startingFeeBps: 5000, endingFeeBps: 100, numberOfPeriod: 24, totalDurationSlots: 360 }
    const p = launchParams('mainnet', { treasurySharePercent: 0, launchFeeSol: 0, launchWindow: window }) as unknown as {
        poolFees: { baseFee: { baseFeeMode: number; firstFactor: number; secondFactor: { toString(): string } } }
        enableFirstSwapWithMinFee: boolean
    }
    assert.equal(p.poolFees.baseFee.baseFeeMode, 1, 'FeeSchedulerExponential')
    assert.equal(p.poolFees.baseFee.firstFactor, 24)
    assert.equal(p.poolFees.baseFee.secondFactor.toString(), '15', 'slots per period')
    assert.equal(p.enableFirstSwapWithMinFee, true)
    const flat = launchParams('mainnet') as unknown as typeof p
    assert.equal(flat.enableFirstSwapWithMinFee, false)
})
