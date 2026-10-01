import { PublicKey } from '@solana/web3.js'
import catalog from '../../../problems/catalog.json'

export type Cluster = 'devnet' | 'mainnet'

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER ?? 'devnet') as Cluster
const PUBLIC_RPC = CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'

/// The browser talks to this site's /api/rpc, which forwards to a dedicated RPC without exposing
/// its key. Server rendering never sends RPC requests, so it can use the public endpoint.
export function rpcEndpoint(): string {
    if (process.env.NEXT_PUBLIC_RPC) return process.env.NEXT_PUBLIC_RPC
    return typeof window === 'undefined' ? PUBLIC_RPC : `${window.location.origin}/api/rpc`
}

/// Subscriptions are light and go to the public endpoint; the app confirms by polling.
export const WS_ENDPOINT = PUBLIC_RPC.replace('https://', 'wss://')
export const LAUNCHPAD = new PublicKey(process.env.NEXT_PUBLIC_LAUNCHPAD ?? '5ZMaqTZ1TgytdTG1EFCuGZg9hSKALfFMuJSg2WT2CJa4')

export interface CatalogEntry {
    mint: string
    name: string
    symbol: string
    kind: 'demo' | 'open'
    demoNote?: string
    /// Kept off the problem lists (still reachable by its address), e.g. a duplicate demo.
    hidden?: boolean
    coefficients: string
    naive: number
    bestKnown: { rank: number; source: string; url: string; asOf: string; ring: string | null }
    ourRecord?: { rank: number; coefficients: string; tool: string }
}

export const CATALOG = (catalog as Record<Cluster, Record<string, CatalogEntry>>)[CLUSTER]

export const REPO_URL = 'https://github.com/MerlijnW70/meteortoll'

export function explorer(kind: 'tx' | 'address', value: string): string {
    const suffix = CLUSTER === 'mainnet' ? '' : '?cluster=devnet'
    return `https://explorer.solana.com/${kind}/${value}${suffix}`
}
