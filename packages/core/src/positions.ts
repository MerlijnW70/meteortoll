import { Buffer } from 'buffer'
import { type Connection, PublicKey } from '@solana/web3.js'
import { DAMM_V2 } from './addresses'

const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
const dammPda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, DAMM_V2)[0]
const seed = (text: string) => Buffer.from(text)

export interface DammPosition {
    position: PublicKey
    positionNftAccount: PublicKey
    dammPool: PublicKey
    dammBaseVault: PublicKey
    dammQuoteVault: PublicKey
}

export function positionNfts(accounts: { pubkey: PublicKey; data: Uint8Array }[]): { mint: PublicKey; account: PublicKey }[] {
    const found: { mint: PublicKey; account: PublicKey }[] = []
    for (const { pubkey, data } of accounts) {
        if (data.length < 72) continue
        const mint = new PublicKey(data.subarray(0, 32))
        const amount = new DataView(data.buffer, data.byteOffset + 64, 8).getBigUint64(0, true)
        if (amount === 1n && pubkey.equals(dammPda(seed('position_nft_account'), mint.toBuffer()))) found.push({ mint, account: pubkey })
    }
    return found
}

export const DAMM_POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188])
export const DAMM_TOKEN_A_MINT_OFFSET = 168

export function dammPoolPairs(info: { owner: PublicKey; data: Uint8Array } | null | undefined, baseMint: PublicKey, quoteMint: PublicKey): boolean {
    if (!info || !info.owner.equals(DAMM_V2) || info.data.length < DAMM_TOKEN_A_MINT_OFFSET + 64) return false
    if (!Buffer.from(info.data.subarray(0, 8)).equals(DAMM_POOL_DISCRIMINATOR)) return false
    const tokenA = new PublicKey(info.data.subarray(DAMM_TOKEN_A_MINT_OFFSET, DAMM_TOKEN_A_MINT_OFFSET + 32))
    const tokenB = new PublicKey(info.data.subarray(DAMM_TOKEN_A_MINT_OFFSET + 32, DAMM_TOKEN_A_MINT_OFFSET + 64))
    return tokenA.equals(baseMint) && tokenB.equals(quoteMint)
}

export async function findPositions(connection: Connection, problem: PublicKey, baseMint: PublicKey, quoteMint: PublicKey): Promise<DammPosition[]> {
    const owned = await connection.getTokenAccountsByOwner(problem, { programId: TOKEN_2022 }, 'confirmed')
    const nfts = positionNfts(owned.value.map(({ pubkey, account }) => ({ pubkey, data: account.data })))
    if (nfts.length === 0) return []
    const positions = nfts.map(({ mint }) => dammPda(seed('position'), mint.toBuffer()))
    const infos = await connection.getMultipleAccountsInfo(positions, 'confirmed')
    const candidates: { position: PublicKey; positionNftAccount: PublicKey; dammPool: PublicKey }[] = []
    nfts.forEach(({ mint, account }, i) => {
        const info = infos[i]
        if (!info || !info.owner.equals(DAMM_V2) || info.data.length < 72) return
        if (!new PublicKey(info.data.subarray(40, 72)).equals(mint)) return
        candidates.push({ position: positions[i], positionNftAccount: account, dammPool: new PublicKey(info.data.subarray(8, 40)) })
    })
    if (candidates.length === 0) return []
    const pools = await connection.getMultipleAccountsInfo(candidates.map((c) => c.dammPool), 'confirmed')
    const found: DammPosition[] = []
    candidates.forEach(({ position, positionNftAccount, dammPool }, i) => {
        if (!dammPoolPairs(pools[i], baseMint, quoteMint)) return
        found.push({
            position,
            positionNftAccount,
            dammPool,
            dammBaseVault: dammPda(seed('token_vault'), baseMint.toBuffer(), dammPool.toBuffer()),
            dammQuoteVault: dammPda(seed('token_vault'), quoteMint.toBuffer(), dammPool.toBuffer()),
        })
    })
    return found
}
