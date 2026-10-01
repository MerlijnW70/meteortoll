import { PublicKey } from '@solana/web3.js'
import catalog from '../../../problems/catalog.json'

export const CLUSTERS = ['devnet', 'mainnet'] as const
export type Cluster = (typeof CLUSTERS)[number]

/// The launchpad each cluster lists problems for. Mainnet's is filled in once it is initialized;
/// until then a mainnet build refuses to start rather than list another cluster's problems.
export const LAUNCHPADS: Record<Cluster, string | undefined> = {
    devnet: '5ZMaqTZ1TgytdTG1EFCuGZg9hSKALfFMuJSg2WT2CJa4',
    mainnet: undefined,
}

export function parseCluster(value: string | undefined): Cluster {
    const cluster = value || 'devnet'
    if (!(CLUSTERS as readonly string[]).includes(cluster)) throw new Error(`NEXT_PUBLIC_CLUSTER is "${cluster}"; use one of ${CLUSTERS.join(', ')}`)
    return cluster as Cluster
}

/// Overrides name their cluster, so switching NEXT_PUBLIC_CLUSTER can never carry one cluster's
/// launchpad over to another. (Next inlines only literal `process.env.NEXT_PUBLIC_*` reads.)
const LAUNCHPAD_OVERRIDES: Record<Cluster, string | undefined> = {
    devnet: process.env.NEXT_PUBLIC_DEVNET_LAUNCHPAD,
    mainnet: process.env.NEXT_PUBLIC_MAINNET_LAUNCHPAD,
}

export function launchpadFor(cluster: Cluster, override: string | undefined, legacy?: string): PublicKey {
    if (legacy) throw new Error(`NEXT_PUBLIC_LAUNCHPAD does not say which cluster it is for; use NEXT_PUBLIC_${cluster.toUpperCase()}_LAUNCHPAD instead`)
    const address = override || LAUNCHPADS[cluster]
    if (!address) throw new Error(`no launchpad is known for ${cluster}: add it to LAUNCHPADS or set NEXT_PUBLIC_${cluster.toUpperCase()}_LAUNCHPAD`)
    return new PublicKey(address)
}

export const CLUSTER = parseCluster(process.env.NEXT_PUBLIC_CLUSTER)
export const PUBLIC_RPC = CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'

/// The browser talks to this site's /api/rpc, which forwards to a dedicated RPC without exposing
/// its key. Server rendering never sends RPC requests, so it can use the public endpoint.
export function rpcEndpoint(): string {
    if (process.env.NEXT_PUBLIC_RPC) return process.env.NEXT_PUBLIC_RPC
    return typeof window === 'undefined' ? PUBLIC_RPC : `${window.location.origin}/api/rpc`
}

/// Subscriptions are light and go to the public endpoint; the app confirms by polling.
export const WS_ENDPOINT = PUBLIC_RPC.replace('https://', 'wss://')
export const LAUNCHPAD = launchpadFor(CLUSTER, LAUNCHPAD_OVERRIDES[CLUSTER], process.env.NEXT_PUBLIC_LAUNCHPAD)

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

export const CATALOG = (catalog as Partial<Record<Cluster, Record<string, CatalogEntry>>>)[CLUSTER] ?? {}

export const REPO_URL = 'https://github.com/MerlijnW70/meteortoll'

export function explorer(kind: 'tx' | 'address', value: string): string {
    const suffix = CLUSTER === 'mainnet' ? '' : '?cluster=devnet'
    return `https://explorer.solana.com/${kind}/${value}${suffix}`
}
