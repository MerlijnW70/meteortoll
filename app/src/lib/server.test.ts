import { test } from 'node:test'
import assert from 'node:assert/strict'
import BN from 'bn.js'
import { Connection, PublicKey } from '@solana/web3.js'
import { TOLL } from '@meteortoll/core'
import { tollReader } from './chain'
import { LAUNCHPAD } from './config'
import { serverProblem, serverProblems } from './server'

const calls: string[] = []
const rows: { pubkey: string; data: string }[] = []
let failing = false

const result = (method: string, params: unknown[]) => {
    if (method === 'getProgramAccounts') return rows.map(({ pubkey, data }) => ({ pubkey, account: { data: [data, 'base64'], executable: false, lamports: 1, owner: TOLL.toBase58(), rentEpoch: 0, space: 0 } }))
    if (method === 'getSlot') return 100
    if (method === 'getMultipleAccounts') return { context: { slot: 100 }, value: (params[0] as unknown[]).map(() => null) }
    return { context: { slot: 100 }, value: null }
}

globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const { id, method, params } = JSON.parse(String(init?.body))
    calls.push(method)
    const body = failing && method === 'getProgramAccounts' ? { jsonrpc: '2.0', id, error: { code: -32000, message: 'boom' } } : { jsonrpc: '2.0', id, result: result(method, params) }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

const asked = (method: string) => calls.filter((c) => c === method).length
const missing = { name: 'ProblemNotFoundError' }

test('list cache', async () => {
    const t = 1_000_000
    await serverProblems(t)
    await serverProblems(t + 29_999)
    assert.equal(asked('getProgramAccounts'), 1)
    await serverProblems(t + 30_000)
    assert.equal(asked('getProgramAccounts'), 2)
    await serverProblems(t + 34_999, true)
    assert.equal(asked('getProgramAccounts'), 2)
    await serverProblems(t + 35_000, true)
    assert.equal(asked('getProgramAccounts'), 3)
})

test('failed list retried', async () => {
    failing = true
    await assert.rejects(serverProblems(2_000_000))
    failing = false
    assert.deepEqual(await serverProblems(2_000_000), [])
})

test('cache size cap', async () => {
    const t = 3_000_000
    const first = PublicKey.unique().toBase58()
    await assert.rejects(serverProblem(first, t), missing)
    for (let i = 1; i < 5_000; i++) await serverProblem(PublicKey.unique().toBase58(), t).catch(() => null)
    await assert.rejects(serverProblem(PublicKey.unique().toBase58(), t), missing)
    const before = asked('getAccountInfo')
    await assert.rejects(serverProblem(first, t), missing)
    assert.equal(asked('getAccountInfo'), before)
})

test('problem cache', async () => {
    const t = 4_000_000
    const [a, b] = [PublicKey.unique().toBase58(), PublicKey.unique().toBase58()]
    await assert.rejects(serverProblem(a, t), missing)
    await assert.rejects(serverProblem(b, t), missing)
    const before = asked('getAccountInfo')
    await assert.rejects(serverProblem(a, t + 29_999), missing)
    assert.equal(asked('getAccountInfo'), before)
    await assert.rejects(serverProblem(a, t + 30_000), missing)
    assert.equal(asked('getAccountInfo'), before + 1)
})

test('listed problem', async () => {
    const key = PublicKey.unique()
    const data = await tollReader(new Connection('http://127.0.0.1:1')).coder.accounts.encode('problem', {
        launchpad: LAUNCHPAD,
        pool: PublicKey.unique(),
        baseMint: PublicKey.unique(),
        quoteMint: PublicKey.unique(),
        baseVault: PublicKey.unique(),
        quoteVault: PublicKey.unique(),
        n1: 2,
        n2: 12,
        n3: 15,
        targetRank: 277,
        solver: null,
        solvedRank: 0,
        solverCommitSlot: new BN(0),
        solvedAtSlot: new BN(0),
        graceSlots: new BN(0),
        attempts: 0,
        bump: 255,
    })
    rows.push({ pubkey: key.toBase58(), data: data.toString('base64') })
    const t = 5_000_000
    const before = asked('getAccountInfo')
    assert.equal((await serverProblem(key.toBase58(), t)).address, key.toBase58())
    assert.equal(asked('getAccountInfo'), before)
    await assert.rejects(serverProblem(PublicKey.unique().toBase58(), t), missing)
    rows.length = 0
})
