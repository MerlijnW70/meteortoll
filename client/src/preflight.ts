import { createHash } from 'node:crypto'
import { type Connection, PublicKey } from '@solana/web3.js'

export const GENESIS: Record<string, string> = {
    mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
}

export const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
export const PROGRAM_DATA_HEADER = 4 + 8 + 1 + 32
const BUFFER_HEADER = 4 + 1 + 32
const PROGRAM_ACCOUNT = 4 + 32
export const LAUNCH_LAMPORTS = 25_610_600
export const launchLamports = (launchFeeSol: number) => LAUNCH_LAMPORTS + Math.round(launchFeeSol * 1e9)
export const MIN_GRACE_SLOTS = 150
export const MAX_GRACE_SLOTS = 216_000
export const MAX_DIMENSION = 255
export const MAX_PRODUCT_COST = 4_096

export function statementProblem(n: number[], target: number): string | null {
    if (n.length !== 3 || !n.every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_DIMENSION)) return `each dimension must be a whole number from 1 to ${MAX_DIMENSION}`
    const [a, b, c] = n
    if (a * b + b * c + c * a > MAX_PRODUCT_COST) return `${a}×${b}×${c} is too large to verify on-chain (n1n2 + n2n3 + n3n1 must be at most ${MAX_PRODUCT_COST})`
    if (!Number.isInteger(target) || target < Math.max(a * b, b * c, c * a) || target >= a * b * c) return `the target must be from ${Math.max(a * b, b * c, c * a)} to ${a * b * c - 1}`
    return null
}

export function siteProblem(uri: string, mainnet: boolean): string | null {
    if (!mainnet) return null
    try {
        return new URL(uri).protocol === 'https:' ? null : 'on mainnet the metadata URI must use https; it is permanent'
    } catch {
        return `${uri} is not a URL`
    }
}
export const SETUP_LAMPORTS = 30_000_000
const WRITE_CHUNK = 1_000
const SIGNATURE_FEE = 5_000

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function programDataMatches(data: Uint8Array, local: Uint8Array): boolean {
    const body = data.subarray(PROGRAM_DATA_HEADER)
    if (body.length < local.length) return false
    for (let i = 0; i < local.length; i++) if (body[i] !== local[i]) return false
    for (let i = local.length; i < body.length; i++) if (body[i] !== 0) return false
    return true
}

export function upgradeAuthority(data: Uint8Array): PublicKey | null {
    return data[12] === 1 ? new PublicKey(data.subarray(13, 45)) : null
}

export interface DeployCost {
    peak: number
    kept: number
}

export function deployCost(programLength: number, rent: (bytes: number) => number): DeployCost {
    const buffer = rent(BUFFER_HEADER + programLength)
    const kept = rent(PROGRAM_DATA_HEADER + programLength) + rent(PROGRAM_ACCOUNT)
    const writes = Math.ceil(programLength / WRITE_CHUNK) * SIGNATURE_FEE
    return { peak: buffer + kept + writes, kept: kept + writes }
}

export async function clusterOf(connection: Connection): Promise<string> {
    const genesis = await connection.getGenesisHash()
    return Object.entries(GENESIS).find(([, hash]) => hash === genesis)?.[0] ?? `unknown (${genesis})`
}

export function clusterProblem(served: string, expected: string): string | null {
    if (served === expected) return null
    if (served.startsWith('unknown') && expected !== 'mainnet' && expected !== 'devnet') return null
    return `TOLL_CLUSTER is ${expected} but the RPC serves ${served}; set TOLL_CLUSTER and TOLL_RPC to the same cluster`
}

export async function assertCluster(connection: Connection, expected: string) {
    const problem = clusterProblem(await clusterOf(connection), expected)
    if (problem) throw new Error(problem)
}
