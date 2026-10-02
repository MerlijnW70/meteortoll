import { PUBLIC_RPC } from './config'

export function rpcUpstreams(env: Record<string, string | undefined> = process.env): string[] {
    const listed = [env.SOLANA_RPC_URL, ...(env.SOLANA_RPC_FALLBACK_URLS ?? '').split(','), PUBLIC_RPC]
    return [...new Set(listed.map((url) => url?.trim()).filter((url): url is string => !!url))]
}

export const passOver = (status: number) => status === 429 || status >= 500

export const hostOf = (url: string) => {
    try {
        return new URL(url).host
    } catch {
        return 'invalid url'
    }
}

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

export function failoverFetch(urls: string[], timeoutMs = 20_000, fetchImpl: typeof fetch = fetch): typeof fetch {
    return (async (_input: RequestInfo | URL, init?: RequestInit) => postWithFailover(urls, String(init?.body ?? ''), timeoutMs, fetchImpl)) as typeof fetch
}
