import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failoverFetch, hostOf, passOver, postWithFailover, rpcUpstreams } from './upstream'

const PUBLIC = 'https://api.devnet.solana.com'

/// A fake network: each URL answers with a status, or throws when it is unreachable.
function network(answers: Record<string, number | 'down'>) {
    const asked: string[] = []
    const fetchImpl = (async (url: RequestInfo | URL) => {
        asked.push(String(url))
        const answer = answers[String(url)]
        if (answer === 'down' || answer === undefined) throw new TypeError('fetch failed')
        return new Response(JSON.stringify({ from: String(url) }), { status: answer })
    }) as typeof fetch
    return { fetchImpl, asked }
}

test('the dedicated RPC comes first, then fallbacks, then the public endpoint', () => {
    assert.deepEqual(rpcUpstreams({ SOLANA_RPC_URL: 'https://a', SOLANA_RPC_FALLBACK_URLS: ' https://b , ,https://c' }), ['https://a', 'https://b', 'https://c', PUBLIC])
})

test('with nothing configured the public endpoint still serves, and repeats are dropped', () => {
    assert.deepEqual(rpcUpstreams({}), [PUBLIC])
    assert.deepEqual(rpcUpstreams({ SOLANA_RPC_URL: PUBLIC, SOLANA_RPC_FALLBACK_URLS: PUBLIC }), [PUBLIC])
})

test('a rate limit or server failure is passed over; an RPC error is an answer', () => {
    for (const status of [429, 500, 502, 503]) assert.equal(passOver(status), true, String(status))
    for (const status of [200, 400, 404]) assert.equal(passOver(status), false, String(status))
})

test('a provider that is down or rate-limiting gives way to the next', async () => {
    const { fetchImpl, asked } = network({ 'https://a': 'down', 'https://b': 429, 'https://c': 200 })
    const response = await postWithFailover(['https://a', 'https://b', 'https://c'], '{}', 1_000, fetchImpl)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { from: 'https://c' })
    assert.deepEqual(asked, ['https://a', 'https://b', 'https://c'])
})

test('a healthy first provider is the only one asked', async () => {
    const { fetchImpl, asked } = network({ 'https://a': 200, 'https://b': 200 })
    await postWithFailover(['https://a', 'https://b'], '{}', 1_000, fetchImpl)
    assert.deepEqual(asked, ['https://a'])
})

test('when every provider fails, the last answer comes back, or the error when none answered', async () => {
    const limited = network({ 'https://a': 503, 'https://b': 429 })
    assert.equal((await postWithFailover(['https://a', 'https://b'], '{}', 1_000, limited.fetchImpl)).status, 429)
    const down = network({ 'https://a': 'down' })
    await assert.rejects(postWithFailover(['https://a'], '{}', 1_000, down.fetchImpl), /fetch failed/)
})

test("web3.js's own URL is ignored: every call goes through the list", async () => {
    const { fetchImpl, asked } = network({ 'https://a': 'down', 'https://b': 200 })
    const response = await failoverFetch(['https://a', 'https://b'], 1_000, fetchImpl)('https://a', { method: 'POST', body: '{"id":1}' })
    assert.equal(response.status, 200)
    assert.deepEqual(asked, ['https://a', 'https://b'])
})

test('logs name a host, never a URL with its key', () => {
    assert.equal(hostOf('https://devnet.helius-rpc.com/?api-key=secret'), 'devnet.helius-rpc.com')
})
