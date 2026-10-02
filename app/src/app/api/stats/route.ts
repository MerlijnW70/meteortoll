import { collectStats, type Stats, toJson } from '@/lib/stats'
import { serverConnection } from '@/lib/server'

// Launchpad totals for the home page. Reading every pool's history is heavy, so the CDN keeps an
// answer for a minute and serves it stale while recomputing: one computation per minute, not per
// visitor. A query string would make every URL its own cache entry, so any is redirected away;
// and each server instance keeps its last answer for the same minute, so even requests that
// reach it cannot make it recompute more often.

const FRESH_MS = 60_000
let last: { at: number; stats: Promise<Stats> } | null = null

function stats(): Promise<Stats> {
    if (last && Date.now() - last.at < FRESH_MS) return last.stats
    const pending = collectStats(serverConnection())
    last = { at: Date.now(), stats: pending }
    // A failed computation is not kept: the next request tries again.
    pending.catch(() => {
        if (last?.stats === pending) last = null
    })
    return pending
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    if (url.search) return Response.redirect(new URL(url.pathname, url.origin), 308)
    try {
        return Response.json(toJson(await stats()), { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=600' } })
    } catch (error) {
        console.error('[stats] failed', error instanceof Error ? error.message : String(error))
        return Response.json({ error: 'stats are temporarily unavailable' }, { status: 502, headers: { 'cache-control': 'no-store' } })
    }
}
