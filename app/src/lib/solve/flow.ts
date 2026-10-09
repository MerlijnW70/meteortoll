import type { Program } from '@coral-xyz/anchor'
import type { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, schemeWork, statusName } from '@meteortoll/core'
import { withRetry } from '../rpc'
import { simulateOrThrow } from '../tx'
import { commitAndOpen, revealAndVerifyTxs, uploadTxs } from './build'
import { committedSalt, fetchAttempt, saveSalt } from './program'
import { ExpiredError, prepare, sendAll, waitForSlot } from './send'

export interface SolveContext {
    connection: Connection
    program: Program
    problem: PublicKey
    solver: PublicKey
    scheme: Uint8Array
    send: (tx: Transaction, signers: Keypair[]) => Promise<string>
    sign: (txs: Transaction[]) => Promise<Transaction[]>
    note: (text: string) => void
    link: (step: 'commit' | 'reveal' | 'verify', signature: string | undefined) => void
    saved: (attempt: PublicKey, salt: Uint8Array) => void
    fetch?: () => Promise<AttemptAccount | null>
    deliver?: typeof sendAll
}

export const NOTES = {
    commit: 'Receipt saved. Prompt 1 of 2: approve the commitment and bond.',
    solve: 'Committed. Prompt 2 of 2: approve the upload, reveal and verification.',
    resume: 'Approve the upload, reveal and verification in one prompt.',
    verify: 'Approve the verification transactions.',
    retry: 'Some transactions expired. Approve the remaining ones.',
}

const MISSING_SALT =
    'This browser does not hold the salt for this commitment, or the file differs from the one committed. Restore it from your commitment receipt, or abandon the attempt to get the bond back.'

const attemptNow = (ctx: SolveContext) => (ctx.fetch ? ctx.fetch() : fetchAttempt(ctx.program, ctx.problem, ctx.solver))

async function landed(ctx: SolveContext) {
    for (let tries = 0; tries < 10; tries++) {
        const state = await attemptNow(ctx)
        if (state) return state
        await new Promise((resolve) => setTimeout(resolve, 800))
    }
    throw new Error('the attempt did not appear after committing')
}

export async function commit(ctx: SolveContext) {
    const { connection, program, problem, solver, scheme } = ctx
    const { tx, buffer, salt, attempt } = await commitAndOpen(connection, program, problem, solver, scheme)
    tx.feePayer = solver
    tx.recentBlockhash = (await withRetry(() => connection.getLatestBlockhash('confirmed'))).blockhash
    await simulateOrThrow(connection, tx)
    saveSalt(attempt, salt)
    ctx.saved(attempt, salt)
    ctx.note(NOTES.commit)
    ctx.link('commit', await ctx.send(tx, [buffer]))
    return { state: await landed(ctx), salt }
}

export async function commitThenSolve(ctx: SolveContext) {
    const { state, salt } = await commit(ctx)
    await solveWith(ctx, state, salt, NOTES.solve)
}

export async function solveCommitted(ctx: SolveContext, state: AttemptAccount) {
    const salt = committedSalt(ctx.problem, ctx.solver, ctx.scheme, state.commitment)
    if (!salt) throw new Error(MISSING_SALT)
    await solveWith(ctx, state, salt, NOTES.resume)
}

async function solveWith(ctx: SolveContext, state: AttemptAccount, salt: Uint8Array, prompt: string, retried = false) {
    const { connection, program, problem, solver, scheme } = ctx
    const attempt = attemptAddress(problem, solver)
    const committedSlot = state.committedSlot.toNumber()
    const deliver = ctx.deliver ?? sendAll
    ctx.note('Waiting for a slot after the commitment…')
    await waitForSlot(connection, committedSlot + 1)
    const uploads = await uploadTxs(connection, program, solver, attempt, state.submission, scheme)
    if (uploads.length === 0) await waitForSlot(connection, committedSlot + 2)
    const steps = await revealAndVerifyTxs(
        connection,
        program,
        { problem, solver, attempt, submission: state.submission },
        { salt, work: schemeWork(scheme), length: scheme.length, revealed: false }
    )
    await prepare(connection, [...uploads, ...steps], solver)
    await simulateOrThrow(connection, uploads[0] ?? steps[0])
    ctx.note(prompt)
    const signed = await ctx.sign([...uploads, ...steps])
    try {
        const written = signed.slice(0, uploads.length)
        if (written.length > 0) await deliver(connection, written, (done) => ctx.note(`Uploaded ${done} of ${written.length} chunks…`))
        ctx.note('Waiting for a new slot before the reveal…')
        await waitForSlot(connection, committedSlot + 2)
        const [reveal] = await deliver(connection, signed.slice(uploads.length, uploads.length + 1), () => ctx.note('Revealed. Verifying on-chain…'))
        ctx.link('reveal', reveal)
        await verifyUntilDone(ctx, signed.slice(uploads.length + 1))
    } catch (error) {
        if (retried || !(error instanceof ExpiredError)) throw error
        const now = await attemptNow(ctx)
        if (!now) throw error
        const status = statusName(now.status)
        if (status === 'committed') await solveWith(ctx, now, salt, NOTES.retry, true)
        else if (status === 'revealed') await finishVerification(ctx, now)
    }
}

export async function finishVerification(ctx: SolveContext, state: AttemptAccount) {
    const { connection, program, problem, solver, scheme } = ctx
    const steps = await revealAndVerifyTxs(
        connection,
        program,
        { problem, solver, attempt: attemptAddress(problem, solver), submission: state.submission },
        { salt: new Uint8Array(32), work: schemeWork(scheme), length: scheme.length, revealed: true }
    )
    ctx.note(NOTES.verify)
    await prepare(connection, steps, solver)
    await verifyUntilDone(ctx, await ctx.sign(steps))
}

async function verifyUntilDone(ctx: SolveContext, signed: Transaction[]) {
    const verified = await (ctx.deliver ?? sendAll)(ctx.connection, signed, (done) => ctx.note(`Verification transaction ${done} confirmed…`), {
        stopWhen: async () => {
            const now = await attemptNow(ctx)
            return !now || statusName(now.status) !== 'revealed'
        },
    })
    ctx.link('verify', verified.at(-1))
}
