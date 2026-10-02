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
