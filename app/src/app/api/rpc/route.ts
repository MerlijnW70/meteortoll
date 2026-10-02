// Forwards the browser's Solana JSON-RPC calls to a dedicated RPC whose URL (and API key) stays
// on the server, moving to the next provider when one fails (lib/upstream.ts). It is deliberately narrow:
// - only the methods this app uses, and getProgramAccounts only for the toll program;
// - only same-origin browser calls (another site cannot spend this RPC through its visitors);
// - small bodies and small batches;
// - a per-instance request budget per client. Serverless instances do not share it, so it slows
//   abuse rather than stopping it; the provider's own limits are the backstop.

import { TOLL } from '@meteortoll/core'
import { MAX_BATCH, MAX_BODY_BYTES } from '@/lib/proxyLimits'
import { postWithFailover, rpcUpstreams } from '@/lib/upstream'

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

const WINDOW_MS = 10_000
const REQUESTS_PER_WINDOW = 200
const UPSTREAM_TIMEOUT_MS = 20_000

const budgets = new Map<string, { start: number; count: number }>()

function overBudget(client: string): boolean {
    const now = Date.now()
    const budget = budgets.get(client)
    if (!budget || now - budget.start > WINDOW_MS) {
        budgets.set(client, { start: now, count: 1 })
        if (budgets.size > 10_000) budgets.clear()
        return false
    }
    budget.count += 1
    return budget.count > REQUESTS_PER_WINDOW
}

interface RpcCall {
    method?: unknown
    params?: unknown
}

function refusal(call: RpcCall): string | null {
    if (typeof call.method !== 'string' || !ALLOWED.has(call.method)) return `method ${String(call.method)} is not allowed`
    if (call.method === 'getProgramAccounts') {
        const program = Array.isArray(call.params) ? call.params[0] : undefined
        if (program !== TOLL.toBase58()) return 'getProgramAccounts is only allowed for the toll program'
    }
    return null
}

const deny = (status: number, error: string) => Response.json({ error }, { status })

export async function POST(request: Request) {

    const origin = request.headers.get('origin')
    if (origin && new URL(origin).host !== new URL(request.url).host) return deny(403, 'cross-origin use is not allowed')

    const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (overBudget(client)) return deny(429, 'too many requests')

    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return deny(413, 'request too large')
    let body: RpcCall | RpcCall[]
    try {
        body = JSON.parse(text)
    } catch {
        return deny(400, 'body must be JSON-RPC')
    }
    const calls = Array.isArray(body) ? body : [body]
    if (calls.length === 0 || calls.length > MAX_BATCH) return deny(400, 'batch size not allowed')
    for (const call of calls) {
        const why = refusal(call)
        if (why) return deny(403, why)
    }

    let response: Response
    try {
        response = await postWithFailover(rpcUpstreams(), text, UPSTREAM_TIMEOUT_MS)
    } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError'
        return deny(timedOut ? 504 : 502, timedOut ? 'no RPC answered in time' : 'no RPC could be reached')
    }
    return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    })
}
