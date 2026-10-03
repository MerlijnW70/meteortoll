import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PublicKey, type Connection } from '@solana/web3.js'
import { TOLL } from '@meteortoll/core'
import { programEvents } from './history'
import { fetchTrades } from './trades'

const FAILED = [155, 10, 79, 249, 136, 194, 187, 103]
const failedLog = () => `Program data: ${Buffer.concat([Buffer.from(FAILED), PublicKey.unique().toBuffer(), PublicKey.unique().toBuffer()]).toString('base64')}`

test('events from toll', () => {
    const logs = [`Program ${TOLL.toBase58()} invoke [1]`, failedLog(), `Program ${TOLL.toBase58()} success`]
    assert.equal(programEvents(logs).length, 1)
})

test('events from others', () => {
    const rogue = PublicKey.unique().toBase58()
    const logs = [`Program ${rogue} invoke [1]`, failedLog(), `Program ${rogue} success`, failedLog()]
    assert.equal(programEvents(logs).length, 0)
})

test('events after a nested call', () => {
    const rogue = PublicKey.unique().toBase58()
    const toll = TOLL.toBase58()
    const logs = [`Program ${toll} invoke [1]`, `Program ${rogue} invoke [2]`, failedLog(), `Program ${rogue} success`, failedLog(), `Program ${toll} success`]
    assert.equal(programEvents(logs).length, 1)
})

test('trade batches', async () => {
    const batches: number[] = []
    const sigs = Array.from({ length: 100 }, (_, i) => ({ signature: `s${i}`, err: null }))
    const connection = {
        getSignaturesForAddress: async (_: PublicKey, { limit }: { limit: number }) => sigs.slice(0, limit),
        getTransactions: async (list: string[]) => {
            batches.push(list.length)
            return list.map(() => null)
        },
    } as unknown as Connection
    assert.deepEqual(await fetchTrades(connection, PublicKey.unique(), 100), [])
    assert.ok(batches.length >= 3 && batches.every((n) => n <= 40), `batches ${batches}`)
})

test('trades only new', async () => {
    const calls: (string | undefined)[] = []
    const connection = {
        getSignaturesForAddress: async (_: PublicKey, { until }: { until?: string }) => {
            calls.push(until)
            return until ? [] : [{ signature: 'newest', err: null }]
        },
        getTransactions: async (list: string[]) => list.map(() => null),
    } as unknown as Connection
    const pool = PublicKey.unique()
    await fetchTrades(connection, pool, 20)
    await fetchTrades(connection, pool, 20)
    assert.deepEqual(calls, [undefined, 'newest'])
})
