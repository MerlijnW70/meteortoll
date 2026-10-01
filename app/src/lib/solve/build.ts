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
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { attemptAddress, commitment, DBC, dbcEventAuthority, dbcPoolAuthority, type ProblemAccount, SUBMISSION_HEADER, TOLL } from '@meteortoll/core'
import { withRetry } from '../rpc'
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

export async function claimTx(connection: Connection, program: Program, problemAddress: PublicKey, problem: ProblemAccount, solver: PublicKey) {
    const solverBase = getAssociatedTokenAddressSync(problem.baseMint, solver)
    const solverQuote = getAssociatedTokenAddressSync(problem.quoteMint, solver)
    const sweep = await sweepInstruction(connection, program, problemAddress, problem)
    const tx = new Transaction()
    if (sweep) tx.add(sweep)
    tx.add(
        createAssociatedTokenAccountIdempotentInstruction(solver, solverBase, solver, problem.baseMint),
        createAssociatedTokenAccountIdempotentInstruction(solver, solverQuote, solver, problem.quoteMint),
        await claimInstruction(program, problemAddress, problem, solver, solverBase, solverQuote)
    )
    if (problem.quoteMint.equals(NATIVE_MINT)) tx.add(createCloseAccountInstruction(solverQuote, solver, solver))
    return tx
}

/// Moves unswept DBC creator fees into the vaults first, so a claim takes everything owed.
async function sweepInstruction(connection: Connection, program: Program, problemAddress: PublicKey, problem: ProblemAccount) {
    const pool = await withRetry(() => new DynamicBondingCurveClient(connection, 'confirmed').state.getPool(problem.pool))
    if (!pool || pool.poolState.isMigrated !== 0) return null
    return methods(program)
        .sweepTradingFees()
        .accountsPartial({
            problem: problemAddress,
            pool: problem.pool,
            poolAuthority: dbcPoolAuthority,
            baseVault: problem.baseVault,
            quoteVault: problem.quoteVault,
            poolBaseVault: pool.poolState.baseVault,
            poolQuoteVault: pool.poolState.quoteVault,
            baseMint: problem.baseMint,
            quoteMint: problem.quoteMint,
            baseTokenProgram: TOKEN_PROGRAM_ID,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
            eventAuthority: dbcEventAuthority,
            dbcProgram: DBC,
        })
        .instruction()
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

export async function claimAndCloseTx(connection: Connection, program: Program, problemAddress: PublicKey, problem: ProblemAccount, solver: PublicKey, submission: PublicKey) {
    const solverBase = getAssociatedTokenAddressSync(problem.baseMint, solver)
    const solverQuote = getAssociatedTokenAddressSync(problem.quoteMint, solver)
    const sweep = await sweepInstruction(connection, program, problemAddress, problem)
    const tx = new Transaction()
    if (sweep) tx.add(sweep)
    tx.add(
        createAssociatedTokenAccountIdempotentInstruction(solver, solverBase, solver, problem.baseMint),
        createAssociatedTokenAccountIdempotentInstruction(solver, solverQuote, solver, problem.quoteMint),
        await claimInstruction(program, problemAddress, problem, solver, solverBase, solverQuote),
        await methods(program)
            .closeAttempt()
            .accountsPartial({ solver, problem: problemAddress, attempt: attemptAddress(problemAddress, solver), submission })
            .instruction()
    )
    if (problem.quoteMint.equals(NATIVE_MINT)) tx.add(createCloseAccountInstruction(solverQuote, solver, solver))
    return tx
}

export async function closeTx(program: Program, problem: PublicKey, solver: PublicKey, submission: PublicKey) {
    return new Transaction().add(
        await methods(program)
            .closeAttempt()
            .accountsPartial({ solver, problem, attempt: attemptAddress(problem, solver), submission: submission.equals(PublicKey.default) ? solver : submission })
            .instruction()
    )
}
