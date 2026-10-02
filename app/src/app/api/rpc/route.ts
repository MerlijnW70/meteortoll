// Forwards the browser's Solana JSON-RPC calls to a dedicated RPC whose URL (and API key) stays
// on the server, moving to the next provider when one fails (lib/upstream.ts). It is deliberately
// narrow (lib/rpcPolicy.ts):
// - only this site's pages: a same-origin browser request, never another site or a bare script;
// - only the methods this app uses, getProgramAccounts only for the toll program and filtered;
// - small bodies and small batches, forwarded as rebuilt from what was checked;
// - a per-instance budget per client, smaller for the calls providers bill heavily. Serverless
//   instances do not share it, so it slows abuse rather than stopping it; the provider's own
//   limits are the backstop.

import { MAX_BATCH, MAX_BODY_BYTES } from '@/lib/proxyLimits'
import { Budget, canonical, count, fromThisSite, HEAVY_READS, refusal, RELAYS, type RpcCall } from '@/lib/rpcPolicy'
import { postWithFailover, rpcUpstreams } from '@/lib/upstream'

const WINDOW_MS = 10_000
const requests = new Budget(200, WINDOW_MS)
const heavyReads = new Budget(1_500, WINDOW_MS)
const relays = new Budget(80, WINDOW_MS)
const UPSTREAM_TIMEOUT_MS = 20_000

const deny = (status: number, error: string) => Response.json({ error }, { status })

export async function POST(request: Request) {
    if (!fromThisSite(request.headers, request.url)) return deny(403, 'only this site’s pages may use this relay')

    const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (requests.over(client, 1)) return deny(429, 'too many requests')

    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return deny(413, 'request too large')
    let body: RpcCall | RpcCall[]
    try {
        body = JSON.parse(text)
    } catch {
        return deny(400, 'body must be JSON-RPC')
    }
    const batch = Array.isArray(body)
    const calls = batch ? (body as RpcCall[]) : [body as RpcCall]
    if (calls.length === 0 || calls.length > MAX_BATCH) return deny(400, 'batch size not allowed')
    for (const call of calls) {
        const why = refusal(call)
        if (why) return deny(403, why)
    }
    if (heavyReads.over(client, count(calls, HEAVY_READS)) || relays.over(client, count(calls, RELAYS))) return deny(429, 'too many requests')

    let response: Response
    try {
        response = await postWithFailover(rpcUpstreams(), canonical(calls, batch), UPSTREAM_TIMEOUT_MS)
    } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError'
        return deny(timedOut ? 504 : 502, timedOut ? 'no RPC answered in time' : 'no RPC could be reached')
    }
    return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    })
}
