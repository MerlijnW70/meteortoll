import { AnchorProvider, type Idl, Program } from '@coral-xyz/anchor'
import type { AnchorWallet } from '@solana/wallet-adapter-react'
import type { Connection, PublicKey } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, commitment, tollIdl } from '@meteortoll/core'
import { withRetry } from '../rpc'

type Builder = { accountsPartial(accounts: Record<string, PublicKey>): { instruction(): Promise<import('@solana/web3.js').TransactionInstruction> } }
type Methods = Record<string, (...args: unknown[]) => Builder>
type Fetcher = Record<string, { fetchNullable(key: PublicKey): Promise<unknown> }>

export const methods = (program: Program) => program.methods as never as Methods

export function tollWriter(connection: Connection, wallet: AnchorWallet) {
    return new Program(tollIdl as Idl, new AnchorProvider(connection, wallet, { commitment: 'confirmed' }))
}

export async function fetchAttempt(program: Program, problem: PublicKey, solver: PublicKey): Promise<AttemptAccount | null> {
    return (await withRetry(() => (program.account as never as Fetcher).attempt.fetchNullable(attemptAddress(problem, solver)))) as AttemptAccount | null
}

const saltKey = (attempt: PublicKey) => `meteortoll:salt:${attempt.toBase58()}`
const KEPT_SALTS = 8

function heldSalts(attempt: PublicKey): string[] {
    const raw = localStorage.getItem(saltKey(attempt))
    if (!raw) return []
    if (!raw.startsWith('[')) return [raw]
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((hex): hex is string => typeof hex === 'string') : []
}

export function saveSalt(attempt: PublicKey, salt: Uint8Array) {
    try {
        const hex = Buffer.from(salt).toString('hex')
        const kept = [hex, ...heldSalts(attempt).filter((held) => held !== hex)].slice(0, KEPT_SALTS)
        localStorage.setItem(saltKey(attempt), JSON.stringify(kept))
    } catch {
    }
}

export function loadSalt(attempt: PublicKey, fits: (salt: Uint8Array) => boolean): Uint8Array | null {
    try {
        for (const hex of heldSalts(attempt)) {
            const salt = Uint8Array.from(Buffer.from(hex, 'hex'))
            if (fits(salt)) return salt
        }
        return null
    } catch {
        return null
    }
}

export function committedSalt(problem: PublicKey, solver: PublicKey, scheme: Uint8Array, onChain: Uint8Array | number[]): Uint8Array | null {
    const expected = Buffer.from(Uint8Array.from(onChain))
    return loadSalt(attemptAddress(problem, solver), (salt) => Buffer.from(commitment(problem, solver, salt, scheme)).equals(expected))
}
