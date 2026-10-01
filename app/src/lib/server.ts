import { Connection } from '@solana/web3.js'
import { PUBLIC_RPC } from './config'

/// Server-side reads use the dedicated RPC directly; the key never leaves the server.
export function serverConnection(): Connection {
    return new Connection(process.env.SOLANA_RPC_URL || PUBLIC_RPC, 'confirmed')
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meteortoll.vercel.app'
