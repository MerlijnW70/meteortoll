import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bountyFunded, costBasis } from './activity'

const buy = (lamports: bigint, tokens: bigint) => ({ kind: 'buy' as const, lamports, tokens })
const sell = (lamports: bigint, tokens: bigint) => ({ kind: 'sell' as const, lamports, tokens })

test('buys', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), buy(300n, 10n)]), { tokens: 20n, cost: 400n, realized: 0n })
})

test('sale at a profit', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), buy(300n, 10n), sell(150n, 5n)]), { tokens: 15n, cost: 300n, realized: 50n })
})

test('sale at a loss', () => {
    assert.deepEqual(costBasis([buy(200n, 10n), sell(50n, 10n)]), { tokens: 0n, cost: 0n, realized: -150n })
})

test('oversold tokens', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), sell(300n, 15n)]), { tokens: 0n, cost: 0n, realized: 200n })
    assert.deepEqual(costBasis([sell(40n, 4n)]), { tokens: 0n, cost: 0n, realized: 40n })
})

test('non-trades', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), { kind: 'claim', lamports: 999n }, { kind: 'commit' }]), { tokens: 10n, cost: 100n, realized: 0n })
})

test('bounty funded', () => {
    assert.equal(bountyFunded([{ kind: 'buy', fee: 8n } as never, { kind: 'sell', fee: 2n } as never, { kind: 'claim', lamports: 5n } as never]), 10n)
})
