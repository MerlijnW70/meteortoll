import { AnchorProvider, type Idl, Program, Wallet } from '@coral-xyz/anchor'
import { type Keypair, type PublicKey, SYSVAR_SLOT_HASHES_PUBKEY, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { type AttemptAccount, type ProblemAccount, SUBMISSION_HEADER, TOLL, tollIdl } from '@meteortoll/core'
import { connection } from './env.js'

export * from '@meteortoll/core'

export function tollProgram(wallet: Keypair) {
    const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: 'confirmed' })
    return new Program(tollIdl as Idl, provider)
}

export type Toll = ReturnType<typeof tollProgram>

type Fetcher = Record<string, { fetch(k: PublicKey): Promise<unknown>; fetchNullable(k: PublicKey): Promise<unknown> }>

export async function fetchProblem(toll: Toll, problem: PublicKey): Promise<ProblemAccount> {
    return (await (toll.account as never as Fetcher).problem.fetch(problem)) as ProblemAccount
}

export async function fetchAttempt(toll: Toll, attempt: PublicKey): Promise<AttemptAccount | null> {
    return (await (toll.account as never as Fetcher).attempt.fetchNullable(attempt)) as AttemptAccount | null
}

export function submissionCreate(payer: PublicKey, submission: PublicKey, length: number, lamports: number): TransactionInstruction {
    return SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: submission,
        lamports,
        space: SUBMISSION_HEADER + length,
        programId: TOLL,
    })
}

export const SLOT_HASHES = SYSVAR_SLOT_HASHES_PUBKEY
export { TOKEN_PROGRAM_ID }
