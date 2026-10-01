import { Connection } from '@solana/web3.js'
import { CLUSTER } from './config'

/// Server-side reads use the dedicated RPC directly; the key never leaves the server.
export function serverConnection(): Connection {
    const fallback = CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'
    return new Connection(process.env.SOLANA_RPC_URL ?? fallback, 'confirmed')
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meteortoll.vercel.app'
