import { PublicKey } from '@solana/web3.js'
import { fetchProblem, tollReader } from '@/lib/chain'
import { serverConnection } from '@/lib/server'

/// Byte offset of `base_mint` in a Problem account: discriminator, launchpad, pool.
const BASE_MINT_OFFSET = 8 + 32 + 32

type Accounts = Record<string, { all(filters?: unknown[]): Promise<{ publicKey: PublicKey }[]> }>

// Token metadata JSON for a launch: the URI its Metaplex metadata points to. Found by looking the
// problem up on-chain by its mint, so a new launch needs no catalog entry.
export async function GET(request: Request, context: RouteContext<'/api/metadata/[mint]'>) {
    const { mint } = await context.params
    let key: PublicKey
    try {
        key = new PublicKey(mint)
    } catch {
        return Response.json({ error: 'not a mint address' }, { status: 400 })
    }
    const connection = serverConnection()
    let problem: Awaited<ReturnType<typeof fetchProblem>>
    try {
        const matches = await (tollReader(connection).account as never as Accounts).problem.all([{ memcmp: { offset: BASE_MINT_OFFSET, bytes: key.toBase58() } }])
        if (matches.length === 0) return Response.json({ error: 'no problem uses this mint' }, { status: 404 })
        problem = await fetchProblem(connection, matches[0].publicKey.toBase58())
    } catch (error) {
        console.error('[metadata] lookup failed', error)
        return Response.json({ error: 'metadata is temporarily unavailable' }, { status: 502, headers: { 'cache-control': 'no-store' } })
    }
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
        { headers: { 'cache-control': 'public, max-age=300' } }
    )
}
