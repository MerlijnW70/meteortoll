// Checks before and after a deploy, so a mainnet run never spends SOL on a wrong assumption: the
// RPC really is the cluster asked for, the wallet holds what the next stage costs, and the
// program on chain is byte for byte the one built here.

import { createHash } from 'node:crypto'
import { type Connection, PublicKey } from '@solana/web3.js'

export const GENESIS: Record<string, string> = {
    mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
}

export const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
/// Header of an upgradeable program's data account: variant, slot, authority option, authority.
export const PROGRAM_DATA_HEADER = 4 + 8 + 1 + 32
/// Header of a deploy buffer: variant, authority option, authority.
const BUFFER_HEADER = 4 + 1 + 32
const PROGRAM_ACCOUNT = 4 + 32
/// What one launch took from the wallet on devnet without a first buy: rent for the mint, pool,
/// pool vaults, metadata (with Metaplex's fee), problem and its vaults, plus fees (launch check of
/// 2026-10-02, problem BTu3MtcdJSbctkiLGR2ir6UKvkgWsonxPanpVybsW6dc, 75,610,600 with a 0.05 first buy).
export const LAUNCH_LAMPORTS = 25_610_600
/// The launchpad's DBC config and launchpad accounts, with room for their fees.
export const SETUP_LAMPORTS = 30_000_000
/// A deploy writes the program in chunks of about this many bytes, one fee each.
const WRITE_CHUNK = 1_000
const SIGNATURE_FEE = 5_000

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/// Whether a program data account holds exactly `local`: the binary, then only zero padding.
export function programDataMatches(data: Uint8Array, local: Uint8Array): boolean {
    const body = data.subarray(PROGRAM_DATA_HEADER)
    if (body.length < local.length) return false
    for (let i = 0; i < local.length; i++) if (body[i] !== local[i]) return false
    for (let i = local.length; i < body.length; i++) if (body[i] !== 0) return false
    return true
}

/// The upgrade authority a program data account names, or null once it is revoked.
export function upgradeAuthority(data: Uint8Array): PublicKey | null {
    return data[12] === 1 ? new PublicKey(data.subarray(13, 45)) : null
}

export interface DeployCost {
    /// Held during the deploy: the buffer, the program data and the program, plus write fees.
    peak: number
    /// Kept after the deploy, once the buffer's rent comes back.
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
