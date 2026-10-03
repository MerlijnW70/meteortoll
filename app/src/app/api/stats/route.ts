import { collectStats, type Stats, toJson } from '@/lib/stats'
import { serverConnection } from '@/lib/server'

export const maxDuration = 60

const FRESH_MS = 60_000
let last: { at: number; stats: Promise<Stats> } | null = null

function stats(): Promise<Stats> {
    if (last && Date.now() - last.at < FRESH_MS) return last.stats
    const pending = collectStats(serverConnection())
    last = { at: Date.now(), stats: pending }
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
