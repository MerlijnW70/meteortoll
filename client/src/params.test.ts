import { test } from 'node:test'
import assert from 'node:assert/strict'
import { launchParams } from './params'

const sol = (lamports: { toString(): string }) => Number(lamports.toString()) / 1e9
const threshold = (profile: Parameters<typeof launchParams>[0]) => sol((launchParams(profile) as unknown as { migrationQuoteThreshold: { toString(): string } }).migrationQuoteThreshold)

test('a mainnet problem graduates once about 15 SOL has gone into its curve', () => {
    const needed = threshold('mainnet')
    console.log(`fact: mainnet graduation after ${needed.toFixed(2)} SOL`)
    assert.ok(needed > 10 && needed < 20, `${needed} SOL`)
})

test('a devnet problem graduates for a fraction of a SOL, so the whole path can be tried', () => {
    assert.ok(threshold('devnet') < 0.5)
})

test('every fee the protocol leaves goes to the creator, and the creator position is locked for good', () => {
    const p = launchParams('mainnet') as unknown as Record<string, unknown>
    assert.equal(p.creatorTradingFeePercentage, 100)
    assert.equal(p.creatorPermanentLockedLiquidityPercentage, 100)
    assert.equal(p.partnerLiquidityPercentage, 0)
    assert.equal(p.creatorLiquidityPercentage, 0)
})
