// The transactions of a submission, grouped so the wallet prompts as few times as possible:
// commit + open buffer, all upload chunks, reveal + verify, claim + close.

import type { Program } from '@coral-xyz/anchor'
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
    ComputeBudgetProgram,
    type Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_SLOT_HASHES_PUBKEY,
    Transaction,
} from '@solana/web3.js'
import { attemptAddress, commitment, type ProblemAccount, SUBMISSION_HEADER, TOLL } from '@meteortoll/core'
import { withRetry } from '../rpc'
import { pack, productive, sweepInstructions, sweepPlan } from '../sweeps'
import { methods } from './program'

export const CHUNK = 900
export const VERIFY_BUDGET = 10_000
const VERIFY_UNITS = 1_400_000

/// One transaction: stake the bond with the commitment, create the buffer account and open it.
export async function commitAndOpen(connection: Connection, program: Program, problem: PublicKey, solver: PublicKey, scheme: Uint8Array) {
    const attempt = attemptAddress(problem, solver)
    const salt = crypto.getRandomValues(new Uint8Array(32))
    const buffer = Keypair.generate()
    const rent = await withRetry(() => connection.getMinimumBalanceForRentExemption(SUBMISSION_HEADER + scheme.length))
    const tx = new Transaction().add(
        await methods(program)
            .commit([...commitment(problem, solver, salt, scheme)])
            .accountsPartial({ solver, problem, attempt })
            .instruction(),
        SystemProgram.createAccount({
            fromPubkey: solver,
            newAccountPubkey: buffer.publicKey,
            lamports: rent,
            space: SUBMISSION_HEADER + scheme.length,
            programId: TOLL,
        }),
        await methods(program).openSubmission(scheme.length).accountsPartial({ solver, attempt, submission: buffer.publicKey }).instruction()
    )
    return { tx, buffer, salt, attempt }
}

/// Chunk writes still needed, comparing against what the buffer already holds.
export async function uploadTxs(connection: Connection, program: Program, solver: PublicKey, attempt: PublicKey, submission: PublicKey, scheme: Uint8Array) {
    const held = (await withRetry(() => connection.getAccountInfo(submission, 'confirmed')))?.data.subarray(SUBMISSION_HEADER) ?? new Uint8Array()
    const txs: Transaction[] = []
    for (let offset = 0; offset < scheme.length; offset += CHUNK) {
        const chunk = scheme.subarray(offset, offset + CHUNK)
        if (Buffer.from(chunk).equals(Buffer.from(held.subarray(offset, offset + CHUNK)))) continue
        txs.push(
            new Transaction().add(
                await methods(program).writeSubmission(offset, Buffer.from(chunk)).accountsPartial({ solver, attempt, submission }).instruction()
            )
        )
    }
    return txs
}

/// Reveal, then enough verify cranks to finish the check; extras are simply not sent.
export async function revealAndVerifyTxs(
    program: Program,
    problem: PublicKey,
    solver: PublicKey,
    attempt: PublicKey,
    submission: PublicKey,
    salt: Uint8Array,
    work: number,
    revealed: boolean
) {
    const txs: Transaction[] = []
    if (!revealed) {
        txs.push(
            new Transaction().add(
                ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                await methods(program)
                    .reveal([...salt])
                    .accountsPartial({ solver, problem, attempt, submission, slotHashes: SYSVAR_SLOT_HASHES_PUBKEY })
                    .instruction()
            )
        )
    }
    const cranks = Math.ceil(work / VERIFY_BUDGET) + 1
    for (let i = 0; i < cranks; i++) {
        const verify = await methods(program).verify(VERIFY_BUDGET).accountsPartial({ cranker: solver, problem, attempt, submission }).instruction()
        // A distinct compute price keeps otherwise identical crank transactions from sharing a signature.
        txs.push(new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: VERIFY_UNITS }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: i + 1 }), verify))
    }
    return txs
}

/// The sweeps that move every owed fee into the vaults, one instruction group each, so a claim
/// takes everything: curve trading fees, the surplus share and the graduated position's fees.
async function sweepGroups(connection: Connection, program: Program, problemAddress: PublicKey, problem: ProblemAccount, payer: PublicKey) {
    const plan = await sweepPlan(connection, problemAddress, problem)
    const ixs = await sweepInstructions(program, problemAddress, problem, plan)
    return (await productive(connection, ixs, payer, { quote: problem.quoteVault, base: problem.baseVault })).map((ix) => [ix])
}

/// The solver's claim: token accounts to receive into, the claim itself, the attempt's close the
/// first time, and unwrapping SOL. One group, so it lands whole.
export async function claimGroup(program: Program, problemAddress: PublicKey, problem: ProblemAccount, solver: PublicKey, submission: PublicKey | null) {
    const solverBase = getAssociatedTokenAddressSync(problem.baseMint, solver)
    const solverQuote = getAssociatedTokenAddressSync(problem.quoteMint, solver)
    const group = [
        createAssociatedTokenAccountIdempotentInstruction(solver, solverBase, solver, problem.baseMint),
        createAssociatedTokenAccountIdempotentInstruction(solver, solverQuote, solver, problem.quoteMint),
        await claimInstruction(program, problemAddress, problem, solver, solverBase, solverQuote),
    ]
    if (submission) {
        group.push(
            await methods(program)
                .closeAttempt()
                .accountsPartial({ solver, problem: problemAddress, attempt: attemptAddress(problemAddress, solver), submission })
                .instruction()
        )
    }
    if (problem.quoteMint.equals(NATIVE_MINT)) group.push(createCloseAccountInstruction(solverQuote, solver, solver))
    return group
}

/// Sweeps then the claim, packed into as few transactions as fit; send them in order.
export async function claimTxs(connection: Connection, program: Program, problemAddress: PublicKey, problem: ProblemAccount, solver: PublicKey, submission: PublicKey | null) {
    const groups = [...(await sweepGroups(connection, program, problemAddress, problem, solver)), await claimGroup(program, problemAddress, problem, solver, submission)]
    return pack(groups, solver)
}

/// Sweeps alone: anyone may move a problem's fees into its bounty.
export async function sweepTxs(connection: Connection, program: Program, problemAddress: PublicKey, problem: ProblemAccount, payer: PublicKey) {
    return pack(await sweepGroups(connection, program, problemAddress, problem, payer), payer)
}

function claimInstruction(program: Program, problemAddress: PublicKey, problem: ProblemAccount, solver: PublicKey, solverBase: PublicKey, solverQuote: PublicKey) {
    return methods(program)
        .claim()
        .accountsPartial({
            solver,
            problem: problemAddress,
            baseVault: problem.baseVault,
            quoteVault: problem.quoteVault,
            solverBase,
            solverQuote,
            baseMint: problem.baseMint,
            quoteMint: problem.quoteMint,
            baseTokenProgram: TOKEN_PROGRAM_ID,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
}

export async function closeTx(program: Program, problem: PublicKey, solver: PublicKey, submission: PublicKey) {
    return new Transaction().add(
        await methods(program)
            .closeAttempt()
            .accountsPartial({ solver, problem, attempt: attemptAddress(problem, solver), submission: submission.equals(PublicKey.default) ? solver : submission })
            .instruction()
    )
}
