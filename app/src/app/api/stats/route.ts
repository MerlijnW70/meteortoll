import { collectStats, toJson } from '@/lib/stats'
import { serverConnection } from '@/lib/server'

// Launchpad totals for the home page. Reading every pool's history is heavy, so the CDN keeps an
// answer for a minute and serves it stale while recomputing: one computation per minute, not per
// visitor.
export async function GET() {
    try {
        const stats = await collectStats(serverConnection())
        return Response.json(toJson(stats), { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=600' } })
    } catch (error) {
        console.error('[stats] failed', error)
        return Response.json({ error: 'stats are temporarily unavailable' }, { status: 502, headers: { 'cache-control': 'no-store' } })
    }
}
