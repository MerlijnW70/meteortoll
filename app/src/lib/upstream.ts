// Which RPC the server talks to, in order, and how it moves on when one fails. Used by the
// browser's relay (/api/rpc) and by everything the server reads itself (totals, sitemap, token
// metadata, share images), so one provider's outage or rate limit does not take the site down.

import { PUBLIC_RPC } from './config'

/// SOLANA_RPC_URL first, then SOLANA_RPC_FALLBACK_URLS (comma-separated), then the cluster's
/// public endpoint as the last resort. Empty entries and repeats are dropped.
export function rpcUpstreams(env: Record<string, string | undefined> = process.env): string[] {
    const listed = [env.SOLANA_RPC_URL, ...(env.SOLANA_RPC_FALLBACK_URLS ?? '').split(','), PUBLIC_RPC]
    return [...new Set(listed.map((url) => url?.trim()).filter((url): url is string => !!url))]
}

/// A provider that is down, slow, rate-limiting or failing gets passed over. A JSON-RPC error
/// (an account that does not exist, a transaction the program rejects) is an answer, not a failure.
export const passOver = (status: number) => status === 429 || status >= 500

/// A host for logs, never the URL: provider URLs carry API keys.
export const hostOf = (url: string) => {
    try {
        return new URL(url).host
    } catch {
        return 'invalid url'
    }
}

/// POSTs the body to each upstream in turn until one answers. Returns that answer, or the last
/// provider's failing answer, or throws when none could be reached at all. Resending a
/// transaction to the next provider is safe: the network processes a signature once.
export async function postWithFailover(urls: string[], body: string, timeoutMs: number, fetchImpl: typeof fetch = fetch): Promise<Response> {
    let last: Response | null = null
    let error: unknown = null
    for (const url of urls) {
        try {
            const response = await fetchImpl(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
                signal: AbortSignal.timeout(timeoutMs),
            })
            if (!passOver(response.status)) return response
            console.error('[rpc] passing over', hostOf(url), response.status)
            last = response
        } catch (failure) {
            console.error('[rpc] passing over', hostOf(url), failure instanceof Error ? failure.name : 'error')
            error = failure
        }
    }
    if (last) return last
    throw error ?? new Error('no RPC is configured')
}

/// A fetch for web3.js's Connection that sends every RPC call through the failover list.
export function failoverFetch(urls: string[], timeoutMs = 20_000, fetchImpl: typeof fetch = fetch): typeof fetch {
    return (async (_input: RequestInfo | URL, init?: RequestInit) => postWithFailover(urls, String(init?.body ?? ''), timeoutMs, fetchImpl)) as typeof fetch
}
