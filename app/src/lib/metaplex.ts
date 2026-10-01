// Token names and symbols from Metaplex metadata accounts, which DBC creates for every launch.

import { PublicKey } from '@solana/web3.js'

export const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

export interface TokenName {
    name: string
    symbol: string
    uri: string
}

export const metadataAddress = (mint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from('metadata'), METAPLEX.toBuffer(), mint.toBuffer()], METAPLEX)[0]

/// Layout: key u8, update authority, mint, then three length-prefixed strings padded with zeros.
export function parseMetadata(data: Uint8Array): TokenName | null {
    if (data.length < 65 + 12) return null
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const decoder = new TextDecoder()
    let at = 65
    const read = () => {
        const length = view.getUint32(at, true)
        if (length > 512 || at + 4 + length > data.length) throw new Error('bad metadata string')
        const text = decoder.decode(data.subarray(at + 4, at + 4 + length)).replace(/\0+$/, '').trim()
        at += 4 + length
        return text
    }
    try {
        return { name: read(), symbol: read(), uri: read() }
    } catch {
        return null
    }
}
