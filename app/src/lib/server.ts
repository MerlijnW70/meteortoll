import { Connection } from '@solana/web3.js'
import { fetchProblem, type ProblemView } from './chain'
import { describeError } from './errors'
import { failoverFetch, rpcUpstreams } from './upstream'

/// Server-side reads use the dedicated RPC directly, falling over to the next provider when it
/// fails; the keys never leave the server.
export function serverConnection(): Connection {
    const urls = rpcUpstreams()
    return new Connection(urls[0], { commitment: 'confirmed', fetch: failoverFetch(urls) })
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meteortoll.vercel.app'

const PROBLEM_TTL_MS = 30_000
const TRANSIENT = ['network', 'busy', 'expired']
const problems = new Map<string, { at: number; value: Promise<ProblemView> }>()

/// A problem as the server reads it, remembered for half a minute per instance, misses included:
/// a page, its preview image and its token metadata ask for the same problem together, and a
/// stream of made-up addresses costs one RPC lookup each per half minute, not one per request.
export function serverProblem(address: string, now = Date.now()): Promise<ProblemView> {
    const hit = problems.get(address)
    if (hit && now - hit.at < PROBLEM_TTL_MS) return hit.value
    if (problems.size > 5_000) problems.clear()
    const value = fetchProblem(serverConnection(), address)
    problems.set(address, { at: now, value })
    // Remember what the chain answered (a problem, or none); forget only a failure to ask.
    value.catch((error) => {
        if (TRANSIENT.includes(describeError(error).kind)) problems.delete(address)
    })
    return value
}
