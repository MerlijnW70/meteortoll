import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bountyFunded, costBasis } from './activity'

const buy = (lamports: bigint, tokens: bigint) => ({ kind: 'buy' as const, lamports, tokens })
const sell = (lamports: bigint, tokens: bigint) => ({ kind: 'sell' as const, lamports, tokens })

test('buys add up to the tokens held and what they cost', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), buy(300n, 10n)]), { tokens: 20n, cost: 400n, realized: 0n })
})

test('a sale takes out the average cost of what it sold and books the difference', () => {
    // Average 20 per token; selling 5 for 150 takes out 100 of cost and realizes 50.
    assert.deepEqual(costBasis([buy(100n, 10n), buy(300n, 10n), sell(150n, 5n)]), { tokens: 15n, cost: 300n, realized: 50n })
})

test('a sale at a loss realizes a negative amount', () => {
    assert.deepEqual(costBasis([buy(200n, 10n), sell(50n, 10n)]), { tokens: 0n, cost: 0n, realized: -150n })
})

test('tokens sold beyond what the trades bought are costed at zero', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), sell(300n, 15n)]), { tokens: 0n, cost: 0n, realized: 200n })
    assert.deepEqual(costBasis([sell(40n, 4n)]), { tokens: 0n, cost: 0n, realized: 40n })
})

test('launches, commitments and claims do not change the cost basis', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), { kind: 'claim', lamports: 999n }, { kind: 'commit' }]), { tokens: 10n, cost: 100n, realized: 0n })
})

test("the bounty a wallet funded is its trades' fees", () => {
    assert.equal(bountyFunded([{ kind: 'buy', fee: 8n } as never, { kind: 'sell', fee: 2n } as never, { kind: 'claim', lamports: 5n } as never]), 10n)
})
