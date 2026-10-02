import { Connection } from '@solana/web3.js'
import { failoverFetch, rpcUpstreams } from './upstream'

/// Server-side reads use the dedicated RPC directly, falling over to the next provider when it
/// fails; the keys never leave the server.
export function serverConnection(): Connection {
    const urls = rpcUpstreams()
    return new Connection(urls[0], { commitment: 'confirmed', fetch: failoverFetch(urls) })
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meteortoll.vercel.app'
