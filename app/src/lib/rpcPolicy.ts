// What the `/api/rpc` relay forwards. It spends this site's RPC key, so it serves only this
// site's pages, only the calls they make, and forwards exactly what it checked.

import { TOLL } from '@meteortoll/core'

export const ALLOWED = new Set([
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

/// Reads a provider bills heavily. The portfolio and history pages make hundreds of them at once
/// (one batched request of transactions), so their budget is counted per call and generous.
export const HEAVY_READS = new Set(['getProgramAccounts', 'getSignaturesForAddress', 'getTransaction'])
/// Calls that make the provider work for the network. A whole submission (commit, upload chunks,
/// reveal, verify) is a few dozen of them.
export const RELAYS = new Set(['sendTransaction', 'simulateTransaction'])

export const count = (calls: RpcCall[], kinds: Set<string>) => calls.filter((call) => kinds.has(call.method as string)).length

export interface RpcCall {
    jsonrpc?: unknown
    id?: unknown
    method?: unknown
    params?: unknown
}

/// Why a call is refused, or null when it may be forwarded.
export function refusal(call: RpcCall): string | null {
    if (typeof call !== 'object' || call === null || Array.isArray(call)) return 'each call must be a JSON-RPC object'
    if (typeof call.method !== 'string' || !ALLOWED.has(call.method)) return `method ${String(call.method)} is not allowed`
    if (call.params !== undefined && !Array.isArray(call.params)) return 'params must be an array'
    if (call.method === 'getProgramAccounts') {
        const [program, config] = (call.params as unknown[] | undefined) ?? []
        if (program !== TOLL.toBase58()) return 'getProgramAccounts is only allowed for the toll program'
        const filters = (config as { filters?: unknown } | undefined)?.filters
        if (!Array.isArray(filters) || filters.length === 0) return 'getProgramAccounts needs a filter'
    }
    return null
}

/// The request as forwarded: rebuilt from the checked fields only, so the provider parses exactly
/// what was checked (a raw body could carry duplicate keys another parser reads differently).
export function canonical(calls: RpcCall[], batch: boolean): string {
    const clean = calls.map((call) => ({ jsonrpc: '2.0', id: call.id ?? null, method: call.method, params: call.params ?? [] }))
    return JSON.stringify(batch ? clean : clean[0])
}

/// Whether a request comes from this site's own pages. Browsers send `Origin` on every POST and
/// `Sec-Fetch-Site` on every fetch; a request with neither is a script, not a page.
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

/// A sliding budget per client and window, kept per server instance.
export class Budget {
    private readonly used = new Map<string, { start: number; count: number }>()

    constructor(
        private readonly limit: number,
        private readonly windowMs: number
    ) {}

    /// Spends `cost` for `client`; true when that goes over its budget.
    over(client: string, cost: number, now = Date.now()): boolean {
        if (cost === 0) return false
        const entry = this.used.get(client)
        if (!entry || now - entry.start > this.windowMs) {
            if (this.used.size > 10_000) this.used.clear()
            this.used.set(client, { start: now, count: cost })
            return cost > this.limit
        }
        entry.count += cost
        return entry.count > this.limit
    }
}
