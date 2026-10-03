import { TOLL } from '@meteortoll/core'
import { LAUNCHPAD } from './config'

export function clientIp(headers: Headers): string {
    const direct = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip')
    if (direct) return direct.trim()
    return headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown'
}

const ALLOWED = new Set([
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
])

export const HEAVY_READS = new Set(['getProgramAccounts', 'getSignaturesForAddress', 'getTransaction'])
export const RELAYS = new Set(['sendTransaction', 'simulateTransaction'])

export const count = (calls: RpcCall[], kinds: Set<string>) => calls.filter((call) => kinds.has(call.method as string)).length

export interface RpcCall {
    jsonrpc?: unknown
    id?: unknown
    method?: unknown
    params?: unknown
}

export function refusal(call: RpcCall): string | null {
    if (typeof call !== 'object' || call === null || Array.isArray(call)) return 'each call must be a JSON-RPC object'
    if (typeof call.method !== 'string' || !ALLOWED.has(call.method)) return `method ${String(call.method)} is not allowed`
    if (call.params !== undefined && !Array.isArray(call.params)) return 'params must be an array'
    if (call.method === 'getProgramAccounts') {
        const [program, config] = (call.params as unknown[] | undefined) ?? []
        if (program !== TOLL.toBase58()) return 'getProgramAccounts is only allowed for the toll program'
        const filters = (config as { filters?: unknown } | undefined)?.filters
        if (!Array.isArray(filters) || filters.length === 0) return 'getProgramAccounts needs a filter'
        const scoped = filters.some((f) => {
            const memcmp = (f as { memcmp?: { offset?: unknown; bytes?: unknown } } | null)?.memcmp
            return memcmp?.offset === 8 && memcmp.bytes === LAUNCHPAD.toBase58()
        })
        if (!scoped) return "getProgramAccounts must filter on this site's launchpad"
    }
    return null
}

export function canonical(calls: RpcCall[], batch: boolean): string {
    const clean = calls.map((call) => ({ jsonrpc: '2.0', id: call.id ?? null, method: call.method, params: call.params ?? [] }))
    return JSON.stringify(batch ? clean : clean[0])
}

export function fromThisSite(headers: Headers, url: string): boolean {
    const site = headers.get('sec-fetch-site')
    if (site !== null && site !== 'same-origin') return false
    const origin = headers.get('origin')
    if (origin === null) return site === 'same-origin'
    try {
        return new URL(origin).host === new URL(url).host
    } catch {
        return false
    }
}

export class Budget {
    private readonly used = new Map<string, { start: number; count: number }>()

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
        private readonly clients = 10_000
    ) {}

    get size() {
        return this.used.size
    }

    private prune(now: number) {
        for (const [key, entry] of this.used) if (now - entry.start > this.windowMs) this.used.delete(key)
        for (const key of this.used.keys()) {
            if (this.used.size < this.clients) break
            this.used.delete(key)
        }
    }

    over(client: string, cost: number, now = Date.now()): boolean {
        if (cost === 0) return false
        const entry = this.used.get(client)
        if (!entry || now - entry.start > this.windowMs) {
            if (!entry && this.used.size >= this.clients) this.prune(now)
            this.used.delete(client)
            this.used.set(client, { start: now, count: cost })
            return cost > this.limit
        }
        entry.count += cost
        return entry.count > this.limit
    }
}
