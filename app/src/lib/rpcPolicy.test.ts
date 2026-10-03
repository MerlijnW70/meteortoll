import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOLL } from '@meteortoll/core'
import { Budget, canonical, clientIp, fromThisSite, refusal } from './rpcPolicy'
import { LAUNCHPAD } from './config'

const URL_ = 'https://meteortoll.vercel.app/api/rpc'
const headers = (h: Record<string, string>) => new Headers(h)

test('same origin', () => {
    assert.ok(fromThisSite(headers({ origin: 'https://meteortoll.vercel.app', 'sec-fetch-site': 'same-origin' }), URL_))
    assert.ok(fromThisSite(headers({ origin: 'https://meteortoll.vercel.app' }), URL_))
    assert.ok(fromThisSite(headers({ 'sec-fetch-site': 'same-origin' }), URL_))
})

test('foreign origin', () => {
    assert.ok(!fromThisSite(headers({ origin: 'https://evil.example' }), URL_))
    assert.ok(!fromThisSite(headers({ origin: 'https://meteortoll.vercel.app', 'sec-fetch-site': 'cross-site' }), URL_))
    assert.ok(!fromThisSite(headers({}), URL_), 'no Origin and no Sec-Fetch-Site: not a browser page')
    assert.ok(!fromThisSite(headers({ origin: 'null' }), URL_))
})

test('refused requests', () => {
    assert.match(refusal({ method: 'requestAirdrop', params: [] })!, /not allowed/)
    assert.match(refusal({ method: 'getBalance', params: 'x' })!, /array/)
    assert.match(refusal([] as never)!, /object/)
    assert.match(refusal({ method: 'getProgramAccounts', params: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] })!, /toll program/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58()] })!, /filter/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [] }] })!, /filter/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [{ memcmp: { offset: 8, bytes: 'x' } }] }] })!, /launchpad/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [{ dataSize: 277 }] }] })!, /launchpad/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [{ memcmp: { offset: 40, bytes: LAUNCHPAD.toBase58() } }] }] })!, /launchpad/)
    assert.match(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [null] }] })!, /launchpad/)
    assert.equal(refusal({ method: 'getProgramAccounts', params: [TOLL.toBase58(), { filters: [{ dataSize: 277 }, { memcmp: { offset: 8, bytes: LAUNCHPAD.toBase58() } }] }] }), null)
    assert.equal(refusal({ method: 'getBalance', params: ['x'] }), null)
})

test('canonical request', () => {
    const raw = '{"jsonrpc":"2.0","id":1,"method":"requestAirdrop","params":[],"method":"getBalance"}'
    const parsed = JSON.parse(raw)
    assert.equal(refusal(parsed), null)
    const forwarded = canonical([parsed], false)
    assert.equal(forwarded, '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":[]}')
    assert.ok(!forwarded.includes('requestAirdrop'))
    assert.equal(canonical([{ id: 2, method: 'getSlot' }], true), '[{"jsonrpc":"2.0","id":2,"method":"getSlot","params":[]}]')
})

test('budget', () => {
    const budget = new Budget(3, 1000)
    assert.ok(!budget.over('a', 2, 0))
    assert.ok(!budget.over('a', 1, 10))
    assert.ok(budget.over('a', 1, 20))
    assert.ok(!budget.over('b', 3, 20), 'budgets are per client')
    assert.ok(!budget.over('a', 1, 1_100), 'a new window starts fresh')
    assert.ok(!budget.over('a', 0, 1_100))
})

test('null call', () => {
    assert.match(refusal(null as never)!, /object/)
    assert.match(refusal('getSlot' as never)!, /object/)
})

test('window edge', () => {
    const budget = new Budget(3, 1000)
    assert.ok(!budget.over('a', 2, 600))
    assert.ok(budget.over('a', 2, 700))
    assert.ok(!budget.over('b', 3, 2000))
    assert.ok(budget.over('b', 1, 3000))
    assert.ok(!budget.over('b', 1, 3001))
})

test('budget kept', () => {
    const budget = new Budget(3, 1000)
    assert.ok(!budget.over('a', 3, 0))
    assert.ok(!budget.over('b', 1, 0))
    assert.ok(budget.over('a', 1, 10))
})

test('budget size cap', () => {
    const budget = new Budget(3, 1000)
    for (let i = 0; i < 10_000; i++) budget.over(`c${i}`, 3, 0)
    assert.ok(!budget.over('new', 1, 0))
    assert.ok(budget.size <= 10_000)
    assert.ok(budget.over('c9999', 1, 0))
})

test('budget keeps active clients', () => {
    const budget = new Budget(5, 1_000, 3)
    budget.over('a', 1, 0)
    budget.over('b', 1, 0)
    budget.over('c', 5, 0)
    budget.over('d', 1, 10)
    assert.equal(budget.over('c', 1, 20), true)
    assert.ok(budget.size <= 3)
})

test('budget forgets stale clients', () => {
    const budget = new Budget(5, 1_000, 2)
    budget.over('a', 5, 0)
    budget.over('b', 5, 0)
    budget.over('c', 1, 2_000)
    assert.equal(budget.over('a', 1, 2_100), false)
})

test('prune at window', () => {
    const budget = new Budget(5, 1_000, 3)
    budget.over('a', 1, 0)
    budget.over('b', 5, 0)
    budget.over('c', 1, 500)
    budget.over('d', 1, 1_000)
    assert.equal(budget.over('b', 1, 1_000), true)
})

test('prune keeps recent', () => {
    const budget = new Budget(5, 1_000, 2)
    budget.over('a', 1, 0)
    budget.over('b', 5, 500)
    budget.over('c', 1, 600)
    assert.equal(budget.over('b', 1, 700), true)
})

test('prune only when full', () => {
    const budget = new Budget(5, 1_000, 10)
    budget.over('a', 1, 0)
    budget.over('b', 1, 0)
    budget.over('c', 1, 2_000)
    assert.equal(budget.size, 3)
    budget.over('a', 1, 2_000)
    assert.equal(budget.size, 3)
})

test('client ip', () => {
    const ip = (h: Record<string, string>) => clientIp(new Headers(h))
    assert.equal(ip({ 'x-vercel-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'x-forwarded-for': '9.9.9.9, 1.2.3.4' }), '1.2.3.4')
    assert.equal(ip({ 'x-real-ip': ' 5.6.7.8 ', 'x-forwarded-for': '9.9.9.9' }), '5.6.7.8')
    assert.equal(ip({ 'x-forwarded-for': 'spoofed, 1.2.3.4' }), '1.2.3.4')
    assert.equal(ip({ 'x-forwarded-for': '1.2.3.4' }), '1.2.3.4')
    assert.equal(ip({}), 'unknown')
})
