// The toll program client for a connected wallet, attempt lookups and the commitment salt.

import { AnchorProvider, type Idl, Program } from '@coral-xyz/anchor'
import type { AnchorWallet } from '@solana/wallet-adapter-react'
import type { Connection, PublicKey } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, tollIdl } from '@meteortoll/core'
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

export function saveSalt(attempt: PublicKey, salt: Uint8Array) {
    try {
        localStorage.setItem(saltKey(attempt), Buffer.from(salt).toString('hex'))
    } catch {
        // Without storage the attempt can still finish in this tab; a reload would need a fresh commit.
    }
}

export function loadSalt(attempt: PublicKey): Uint8Array | null {
    try {
        const hex = localStorage.getItem(saltKey(attempt))
        return hex ? Uint8Array.from(Buffer.from(hex, 'hex')) : null
    } catch {
        return null
    }
}
