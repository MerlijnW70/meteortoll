import { AnchorProvider, type Idl, Program, Wallet } from '@coral-xyz/anchor'
import { type Keypair, type PublicKey, SYSVAR_SLOT_HASHES_PUBKEY, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { type AttemptAccount, DAMM_V2, type DammPosition, dammEventAuthority, dammPoolAuthority, type ProblemAccount, PROBLEM_SPACE, SUBMISSION_HEADER, TOLL, tollIdl } from '@meteortoll/core'
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

type Builder = { accountsPartial(accounts: Record<string, PublicKey>): { instruction(): Promise<TransactionInstruction> } }

export async function positionSweeps(toll: Pick<Toll, 'methods'>, problem: PublicKey, account: ProblemAccount, positions: DammPosition[]): Promise<TransactionInstruction[]> {
    const sweep = (toll.methods as never as { sweepPositionFees(): Builder }).sweepPositionFees
    const out: TransactionInstruction[] = []
    for (const p of positions) {
        out.push(
            await sweep()
                .accountsPartial({
                    problem,
                    dammPoolAuthority,
                    dammPool: p.dammPool,
                    position: p.position,
                    positionNftAccount: p.positionNftAccount,
                    baseVault: account.baseVault,
                    quoteVault: account.quoteVault,
                    dammBaseVault: p.dammBaseVault,
                    dammQuoteVault: p.dammQuoteVault,
                    baseMint: account.baseMint,
                    quoteMint: account.quoteMint,
                    baseTokenProgram: TOKEN_PROGRAM_ID,
                    quoteTokenProgram: TOKEN_PROGRAM_ID,
                    dammEventAuthority,
                    dammProgram: DAMM_V2,
                })
                .instruction()
        )
    }
    return out
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

type Lister = Record<string, { all(filters: ({ dataSize: number } | { memcmp: { offset: number; bytes: string } })[]): Promise<{ publicKey: PublicKey; account: unknown }[]> }>

export async function launchpadProblems(toll: Pick<Toll, 'account'>, launchpad: PublicKey): Promise<{ problem: PublicKey; account: ProblemAccount }[]> {
    const rows = await (toll.account as never as Lister).problem.all([{ dataSize: PROBLEM_SPACE }, { memcmp: { offset: 8, bytes: launchpad.toBase58() } }])
    return rows.map((row) => ({ problem: row.publicKey, account: row.account as ProblemAccount })).filter((row) => row.account.launchpad.equals(launchpad))
}

export async function treasuryPools(toll: Pick<Toll, 'account'>, launchpad: PublicKey, known: Record<string, { problem: string }>): Promise<{ label: string; pool: PublicKey }[]> {
    const labels = new Map(Object.entries(known).map(([key, found]) => [found.problem, key]))
    return (await launchpadProblems(toll, launchpad)).map(({ problem, account }) => ({ label: labels.get(problem.toBase58()) ?? problem.toBase58(), pool: account.pool }))
}
