import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Connection } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import type { ProblemView } from './chain'
import { allSignatures, type HistoryEvent } from './history'
import { type Activity, fromJson, summarize, toJson } from './stats'
import type { Trade } from './trades'

const problem = (address: string, phase: ProblemView['phase'], bounty: bigint, unswept: bigint, hidden = false, bonds = 0n) =>
    ({ address, phase, vaultLamports: bounty, unsweptLamports: unswept, bondsLamports: bonds, info: { hidden } }) as unknown as ProblemView
const trade = (trader: string, quoteLamports: bigint) => ({ trader, quoteLamports }) as Trade
const claim = (lamports: bigint) => ({ kind: 'claim', lamports }) as HistoryEvent

test('totals', () => {
    const problems = [problem('a', 'open', 100n, 5n), problem('b', 'solved', 7n, 3n), problem('c', 'open', 1_000n, 0n, true)]
    const activity = new Map<string, Activity>([
        ['a', { trades: [trade('x', 50n), trade('y', 20n)], history: [] }],
        ['b', { trades: [trade('x', 30n)], history: [claim(400n), claim(100n)] }],
        ['c', { trades: [trade('z', 9_999n)], history: [claim(9_999n)] }],
    ])
    assert.deepEqual(summarize(problems, activity), {
        problems: 2,
        open: 1,
        solved: 1,
        bountyLamports: 105n,
        paidLamports: 500n,
        volumeLamports: 100n,
        trades: 3,
        traders: 2,
    })
})

test('forfeited bonds', () => {
    const s = summarize([problem('a', 'open', 100n, 5n, false, 50_000_000n)], new Map())
    assert.equal(s.bountyLamports, 50_000_105n)
})

test('idle problem', () => {
    const s = summarize([problem('a', 'open', 0n, 0n)], new Map())
    assert.equal(s.problems, 1)
    assert.equal(s.trades, 0)
})

test('json round trip', () => {
    const s = summarize([problem('a', 'open', 9_007_199_254_740_993n, 0n)], new Map())
    const back = fromJson(JSON.parse(JSON.stringify(toJson(s))))
    assert.deepEqual(back, s)
})

test('signature paging', async () => {
    const total = 2_500
    const sigs = Array.from({ length: total }, (_, i) => ({ signature: `s${i}`, err: null }))
    const calls: { limit: number; before?: string }[] = []
    const connection = {
        getSignaturesForAddress: async (_: PublicKey, { limit, before }: { limit: number; before?: string }) => {
            calls.push({ limit, before })
            const start = before ? sigs.findIndex((s) => s.signature === before) + 1 : 0
            return sigs.slice(start, start + limit)
        },
    } as unknown as Connection
    const all = await allSignatures(connection, PublicKey.default, 5_000)
    assert.equal(all.length, total)
    assert.equal(new Set(all.map((s) => s.signature)).size, total, 'no page repeated')
    assert.deepEqual(calls.map((c) => c.limit), [1_000, 1_000, 1_000])
    assert.equal(calls[1].before, 's999')

    calls.length = 0
    assert.equal((await allSignatures(connection, PublicKey.default, 1_200)).length, 1_200)
    assert.deepEqual(calls.map((c) => c.limit), [1_000, 200])
})
