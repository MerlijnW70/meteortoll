import { PublicKey } from '@solana/web3.js'
import type { ProblemView } from '@/lib/chain'
import { Budget } from '@/lib/rpcPolicy'
import { serverProblems } from '@/lib/server'

const lookups = new Budget(60, 60_000)

export async function GET(request: Request, context: RouteContext<'/api/metadata/[mint]'>) {
    const { mint } = await context.params
    let key: PublicKey
    try {
        key = new PublicKey(mint)
    } catch {
        return Response.json({ error: 'not a mint address' }, { status: 400 })
    }
    const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (lookups.over(client, 1)) return Response.json({ error: 'too many requests' }, { status: 429 })
    let problem: ProblemView | undefined
    try {
        problem = (await serverProblems()).find((p) => p.account.baseMint.equals(key))
    } catch (error) {
        console.error('[metadata] lookup failed', error instanceof Error ? error.message : String(error))
        return Response.json({ error: 'metadata is temporarily unavailable' }, { status: 502, headers: { 'cache-control': 'no-store' } })
    }
    if (!problem) return Response.json({ error: 'no problem uses this mint' }, { status: 404, headers: { 'cache-control': 'public, s-maxage=30' } })
    const { n1, n2, n3, targetRank } = problem.account
    const origin = new URL(request.url).origin
    const record = problem.info.bestKnown ? ` Best known rank ${problem.info.bestKnown.rank} (${problem.info.bestKnown.source}, ${problem.info.bestKnown.asOf}).` : ''
    return Response.json(
        {
            name: problem.info.name,
            symbol: problem.info.symbol,
            description: `${problem.info.kind === 'demo' ? 'Disclosed demo. ' : ''}Multiply a ${n1}×${n2} by a ${n2}×${n3} matrix with at most ${targetRank} multiplications. Trading fees fund a bounty paid to the first scheme a Solana program verifies.${record}`,
            image: `${origin}/p/${problem.address}/opengraph-image`,
            external_url: `${origin}/p/${problem.address}`,
        },
        { headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } }
    )
}
