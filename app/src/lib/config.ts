import { PublicKey } from '@solana/web3.js'
import catalog from '../../../problems/catalog.json'

const CLUSTERS = ['devnet', 'mainnet'] as const
export type Cluster = (typeof CLUSTERS)[number]

export const LAUNCHPADS: Record<Cluster, string | undefined> = {
    devnet: '5ZMaqTZ1TgytdTG1EFCuGZg9hSKALfFMuJSg2WT2CJa4',
    mainnet: undefined,
}

export function parseCluster(value: string | undefined): Cluster {
    const cluster = value || 'devnet'
    if (!(CLUSTERS as readonly string[]).includes(cluster)) throw new Error(`NEXT_PUBLIC_CLUSTER is "${cluster}"; use one of ${CLUSTERS.join(', ')}`)
    return cluster as Cluster
}

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

export const DBC_CONFIGS: Record<Cluster, string | undefined> = {
    devnet: 'Z4PT2dz65c2AW7jVYCoArmRvDSuLqZhQ7AnqFA2y1wT',
    mainnet: undefined,
}

const DBC_CONFIG_OVERRIDES: Record<Cluster, string | undefined> = {
    devnet: process.env.NEXT_PUBLIC_DEVNET_DBC_CONFIG,
    mainnet: process.env.NEXT_PUBLIC_MAINNET_DBC_CONFIG,
}

export function dbcConfigFor(cluster: Cluster, override: string | undefined): PublicKey | null {
    const address = override || DBC_CONFIGS[cluster]
    return address ? new PublicKey(address) : null
}

export const CLUSTER = parseCluster(process.env.NEXT_PUBLIC_CLUSTER)
export const PUBLIC_RPC = CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'

export function rpcEndpoint(): string {
    if (process.env.NEXT_PUBLIC_RPC) return process.env.NEXT_PUBLIC_RPC
    return typeof window === 'undefined' ? PUBLIC_RPC : `${window.location.origin}/api/rpc`
}

export const WS_ENDPOINT = PUBLIC_RPC.replace('https://', 'wss://')
export const LAUNCHPAD = launchpadFor(CLUSTER, LAUNCHPAD_OVERRIDES[CLUSTER], process.env.NEXT_PUBLIC_LAUNCHPAD)
export const DBC_CONFIG = dbcConfigFor(CLUSTER, DBC_CONFIG_OVERRIDES[CLUSTER])

export interface CatalogEntry {
    mint: string
    name: string
    symbol: string
    kind: 'demo' | 'open'
    demoNote?: string
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
