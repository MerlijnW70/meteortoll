import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOLL } from '@meteortoll/core'
import { Budget, canonical, clientIp, refusal, type RpcCall } from './rpcPolicy'
import { LAUNCHPAD } from './config'

const ALLOWED = [
    'getAccountInfo',
    'getBalance',
    'getBlockHeight',
    'getEpochInfo',
    'getFeeForMessage',
    'getGenesisHash',
    'getHealth',
    'getLatestBlockhash',
    'getMinimumBalanceForRentExemption',
    'getMultipleAccounts',
    'getProgramAccounts',
    'getRecentPrioritizationFees',
    'getSignatureStatuses',
    'getSignaturesForAddress',
    'getSlot',
    'getTokenAccountBalance',
    'getTokenAccountsByOwner',
    'getTransaction',
    'getVersion',
    'isBlockhashValid',
    'sendTransaction',
    'simulateTransaction',
]
const PROGRAM = TOLL.toBase58()
const PAD = LAUNCHPAD.toBase58()

function rng(seed: number) {
    let s = seed >>> 0
    return () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

type Rand = ReturnType<typeof rng>
const int = (r: Rand, n: number) => Math.floor(r() * n)
const pick = <T>(r: Rand, items: readonly T[]): T => items[int(r, items.length)]

const KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'method', 'params', 'id', 'jsonrpc', 'filters', 'memcmp', 'offset', 'bytes', '']
const STRINGS = ['', ' ', 'getbalance', 'getBalance ', 'getBalance\u0000', 'gеtBalance', '𝚐𝚎𝚝𝚂𝚕𝚘𝚝', 'requestAirdrop', 'getProgramAccounts', PROGRAM, PAD, '__proto__', '‮getSlot', 'null', '8']
const NUMBERS = [0, -0, 8, 8.0000001, -8, 1e308, -1e308, Number.MAX_SAFE_INTEGER, 2 ** 64, 1e-300, 7.9999999999999999]

function value(r: Rand, depth: number): unknown {
    const k = int(r, depth > 3 ? 6 : 9)
    switch (k) {
        case 0:
            return null
        case 1:
            return r() < 0.5
        case 2:
            return pick(r, NUMBERS)
        case 3:
            return pick(r, STRINGS)
        case 4:
            return pick(r, ALLOWED)
        case 5:
            return String.fromCodePoint(...Array.from({ length: int(r, 6) }, () => int(r, 0x10ffff - 0xe000) + (r() < 0.5 ? 0 : 0xe000)).map((c) => (c >= 0xd800 && c < 0xe000 ? 0x41 : c)))
        case 6:
            return Array.from({ length: int(r, 4) }, () => value(r, depth + 1))
        default:
            return object(r, depth + 1)
    }
}

function object(r: Rand, depth: number): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (let i = int(r, 4); i > 0; i--) Object.defineProperty(out, pick(r, KEYS), { value: value(r, depth), enumerable: true, configurable: true, writable: true })
    return out
}

function filter(r: Rand): unknown {
    const memcmp = () => {
        const m: Record<string, unknown> = {}
        if (r() < 0.9) m.offset = r() < 0.6 ? 8 : pick(r, [...NUMBERS, '8', null, [8], { valueOf: 8 }])
        if (r() < 0.9) m.bytes = r() < 0.6 ? PAD : pick(r, [...STRINGS, PAD.toLowerCase(), ` ${PAD}`, [PAD], null])
        if (r() < 0.2) m.encoding = pick(r, ['base58', 'base64', 7])
        return m
    }
    switch (int(r, 8)) {
        case 0:
            return { memcmp: memcmp() }
        case 1:
            return { dataSize: pick(r, [277, 0, -1, '277', null]) }
        case 2:
            return { memcmp: memcmp(), dataSize: 277 }
        case 3:
            return [{ memcmp: memcmp() }]
        case 4:
            return { memcmp: [memcmp()] }
        case 5:
            return JSON.parse(`{"__proto__":{"memcmp":{"offset":8,"bytes":"${PAD}"}}}`)
        case 6:
            return { tokenAccountState: {} }
        default:
            return value(r, 2)
    }
}

function programAccounts(r: Rand): RpcCall {
    const program = r() < 0.7 ? PROGRAM : pick(r, [...STRINGS, PROGRAM.toLowerCase(), [PROGRAM], null])
    const filters = r() < 0.85 ? Array.from({ length: int(r, 4) }, () => filter(r)) : value(r, 2)
    const config = r() < 0.85 ? { encoding: 'base64', filters } : pick(r, [null, [filters], 'filters', JSON.parse(`{"__proto__":{"filters":[{"memcmp":{"offset":8,"bytes":"${PAD}"}}]}}`)])
    const params = r() < 0.9 ? [program, config, ...(r() < 0.2 ? [value(r, 2)] : [])] : value(r, 1)
    return { jsonrpc: '2.0', id: value(r, 3), method: 'getProgramAccounts', params }
}

function call(r: Rand): unknown {
    switch (int(r, 10)) {
        case 0:
        case 1:
        case 2:
            return programAccounts(r)
        case 3:
        case 4:
        case 5:
            return { jsonrpc: '2.0', id: pick(r, [1, 2 ** 64, -1, 'x'.repeat(int(r, 300)), null, [], {}, 1e308]), method: pick(r, ALLOWED), params: r() < 0.8 ? [value(r, 2)] : value(r, 2) }
        case 6:
            return JSON.parse(`{"method":"requestAirdrop","params":[],"method":"${pick(r, ALLOWED)}","__proto__":{"method":"requestAirdrop"},"constructor":{"prototype":{"method":"x"}}}`)
        case 7:
            return { ...object(r, 1), method: value(r, 1) }
        case 8:
            return value(r, 0)
        default:
            return object(r, 0)
    }
}

function body(r: Rand): { calls: unknown[]; batch: boolean } {
    if (r() < 0.6) return { calls: [call(r)], batch: false }
    return { calls: Array.from({ length: 1 + int(r, 6) }, () => call(r)), batch: true }
}

function scoped(c: RpcCall): boolean {
    const [program, config] = c.params as unknown[]
    if (program !== PROGRAM) return false
    const filters = (config as { filters?: unknown }).filters
    return Array.isArray(filters) && filters.some((f) => Object.hasOwn(Object(f), 'memcmp') && f.memcmp?.offset === 8 && Object.hasOwn(f.memcmp, 'bytes') && f.memcmp.bytes === PAD)
}

const RUNS = 20_000

test('refusal fuzz', () => {
    const r = rng(1)
    let accepted = 0
    let programScans = 0
    for (let i = 0; i < RUNS; i++) {
        const raw = body(r)
        const roundTrip = JSON.parse(JSON.stringify(raw.calls)) as unknown[]
        for (const c of [...raw.calls, ...roundTrip]) {
            let why: string | null
            try {
                why = refusal(c as RpcCall)
            } catch (error) {
                assert.fail(`refusal threw ${error} on ${JSON.stringify(c)}`)
            }
            assert.ok(why === null || why.length > 0)
            if (why !== null) continue
            accepted++
            const ok = c as RpcCall
            assert.ok(ALLOWED.includes(ok.method as string), `accepted ${String(ok.method)}`)
            assert.ok(ok.params === undefined || Array.isArray(ok.params))
            if (ok.method === 'getProgramAccounts') {
                programScans++
                assert.ok(scoped(ok), `unscoped scan accepted: ${JSON.stringify(ok)}`)
            }
        }
    }
    assert.ok(accepted > 1_000 && programScans > 200, `${accepted} accepted, ${programScans} scans`)
})

test('canonical fuzz', () => {
    const r = rng(2)
    let checked = 0
    for (let i = 0; i < RUNS; i++) {
        const { calls, batch } = body(r)
        const parsed = JSON.parse(JSON.stringify(calls)) as RpcCall[]
        if (!parsed.every((c) => refusal(c) === null)) continue
        checked++
        const out = JSON.parse(canonical(parsed, batch))
        const list: Record<string, unknown>[] = batch ? out : [out]
        assert.equal(Array.isArray(out), batch)
        assert.equal(list.length, parsed.length)
        list.forEach((c, n) => {
            assert.deepEqual(Object.keys(c).sort(), ['id', 'jsonrpc', 'method', 'params'])
            assert.equal(c.jsonrpc, '2.0')
            assert.equal(c.method, parsed[n].method)
            assert.ok(Array.isArray(c.params))
            assert.equal(refusal(c), null)
        })
    }
    assert.ok(checked > 1_000, `${checked} checked`)
})

test('canonical drops smuggled', () => {
    const r = rng(3)
    for (let i = 0; i < 2_000; i++) {
        const method = pick(r, ALLOWED.filter((m) => m !== 'getProgramAccounts'))
        const text = `{"jsonrpc":"1.0","id":${i},"method":"requestAirdrop","params":[],"method":"${method}","__proto__":{"method":"requestAirdrop"},"extra":"requestAirdrop"}`
        const forwarded = canonical([JSON.parse(text)], false)
        assert.ok(!forwarded.includes('requestAirdrop'), forwarded)
        assert.equal(JSON.parse(forwarded).jsonrpc, '2.0')
    }
})

test('method object', () => {
    assert.match(refusal(JSON.parse('{"method":{"toString":1}}'))!, /not allowed/)
    assert.match(refusal(JSON.parse('{"method":{"toString":null,"valueOf":null}}'))!, /not allowed/)
    assert.match(refusal({ method: Object.create(null) })!, /not allowed/)
})

const HEADER_VALUES = ['', ' ', '\t', '\v', '\f', ' ', ',', ', ,', '1.2.3.4', ' 1.2.3.4 ', '1.2.3.4,', ',1.2.3.4', '::1', 'unknown', 'a'.repeat(4096), 'ÿþ', '1.2.3.4,  ']

test('client ip fuzz', () => {
    const r = rng(4)
    for (let i = 0; i < RUNS; i++) {
        const headers = new Headers()
        for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
            if (r() < 0.5) continue
            const v = r() < 0.7 ? pick(r, HEADER_VALUES) : Array.from({ length: int(r, 5) }, () => pick(r, HEADER_VALUES)).join(pick(r, [',', ', ', ' ,']))
            try {
                headers.set(name, v)
            } catch {
                continue
            }
        }
        const ip = clientIp(headers)
        assert.equal(typeof ip, 'string')
        assert.ok(ip.length > 0, `empty ip for ${JSON.stringify([...headers])}`)
        assert.equal(ip, ip.trim())
    }
})

test('blank vercel ip', () => {
    assert.equal(clientIp(new Headers({ 'x-vercel-forwarded-for': ' ' })), 'unknown')
    assert.equal(clientIp(new Headers({ 'x-real-ip': '\v', 'x-forwarded-for': '1.2.3.4' })), '1.2.3.4')
})

function drive(seed: number, clients: number, cap: number) {
    const r = rng(seed)
    const limit = 1 + int(r, 20)
    const windowMs = 100 + int(r, 1_000)
    const budget = new Budget(limit, windowMs, cap)
    const windows = new Map<string, { start: number; let: number; refused: boolean }>()
    let now = 0
    for (let i = 0; i < 5_000; i++) {
        now += int(r, 40)
        const client = `c${int(r, clients)}`
        const cost = r() < 0.1 ? 0 : 1 + int(r, 3)
        const over = budget.over(client, cost, now)
        assert.ok(budget.size <= cap, `size ${budget.size} > ${cap}`)
        if (cost === 0) {
            assert.equal(over, false)
            continue
        }
        let w = windows.get(client)
        if (!w || now - w.start > windowMs) {
            w = { start: now, let: 0, refused: false }
            windows.set(client, w)
        }
        if (clients > cap) continue
        if (w.refused) assert.ok(over, `client ${client} let through after refusal at ${now} (limit ${limit}, window ${windowMs})`)
        if (over) w.refused = true
        else w.let += cost
        assert.ok(w.let <= limit, `client ${client} got ${w.let} > ${limit} in window from ${w.start} (now ${now}, cap ${cap})`)
    }
}

test('budget fuzz', () => {
    for (let seed = 0; seed < 200; seed++) drive(seed, 1 + (seed % 50), 10_000)
})

test('budget fuzz capped', () => {
    for (let seed = 0; seed < 200; seed++) drive(seed, 2 + (seed % 50), 1 + (seed % 60))
})

test('budget fuzz at cap', () => {
    for (let seed = 0; seed < 200; seed++) drive(seed, 1 + (seed % 30), 1 + (seed % 30))
})
