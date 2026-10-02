import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOLL } from '@meteortoll/core'
import { Budget, canonical, fromThisSite, refusal } from './rpcPolicy'

const URL_ = 'https://meteortoll.vercel.app/api/rpc'
const headers = (h: Record<string, string>) => new Headers(h)

test("only this site's pages may use the relay", () => {
    assert.ok(fromThisSite(headers({ origin: 'https://meteortoll.vercel.app', 'sec-fetch-site': 'same-origin' }), URL_))
    assert.ok(fromThisSite(headers({ origin: 'https://meteortoll.vercel.app' }), URL_))
    assert.ok(fromThisSite(headers({ 'sec-fetch-site': 'same-origin' }), URL_))
})

test('another site, a bare script and a malformed origin are refused', () => {
    assert.ok(!fromThisSite(headers({ origin: 'https://evil.example' }), URL_))
    assert.ok(!fromThisSite(headers({ origin: 'https://meteortoll.vercel.app', 'sec-fetch-site': 'cross-site' }), URL_))
    assert.ok(!fromThisSite(headers({}), URL_), 'no Origin and no Sec-Fetch-Site: not a browser page')
    assert.ok(!fromThisSite(headers({ origin: 'null' }), URL_))
})

test('methods outside the list, odd shapes and unfiltered scans are refused', () => {
    assert.match(refusal({ method: 'requestAirdrop', params: [] })!, /not allowed/)
    assert.match(refusal({ method: 'getBalance', params: 'x' })!, /array/)
    assert.match(refusal([] as never)!, /object/)
    assert.match(refusal({ method: 'getProgramAccounts', params: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] })!, /toll program/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58()] })!, /filter/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [] }] })!, /filter/)
    assert.equal(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [{ memcmp: { offset: 8, bytes: 'x' } }] }] }), null)
    assert.equal(refusal({ method: 'getBalance', params: ['x'] }), null)
})

test('what is forwarded is rebuilt from the checked fields: a duplicate key cannot smuggle a method', () => {
    const raw = '{"jsonrpc":"2.0","id":1,"method":"requestAirdrop","params":[],"method":"getBalance"}'
    const parsed = JSON.parse(raw)
    assert.equal(refusal(parsed), null)
    const forwarded = canonical([parsed], false)
    assert.equal(forwarded, '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":[]}')
    assert.ok(!forwarded.includes('requestAirdrop'))
    assert.equal(canonical([{ id: 2, method: 'getSlot' }], true), '[{"jsonrpc":"2.0","id":2,"method":"getSlot","params":[]}]')
})

test('a budget allows its limit per window, then refuses until the window passes', () => {
    const budget = new Budget(3, 1000)
    assert.ok(!budget.over('a', 2, 0))
    assert.ok(!budget.over('a', 1, 10))
    assert.ok(budget.over('a', 1, 20))
    assert.ok(!budget.over('b', 3, 20), 'budgets are per client')
    assert.ok(!budget.over('a', 1, 1_100), 'a new window starts fresh')
    assert.ok(!budget.over('a', 0, 1_100))
})
