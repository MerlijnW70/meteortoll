'use client'

// The submission sequence for one problem and one wallet, resumable from on-chain state:
// commit + open, upload (one approval), reveal + verify (one approval), claim + close.

import { useMemo, useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Program } from '@coral-xyz/anchor'
import { type Connection, PublicKey, type Transaction } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, commitment, schemeWork, statusName } from '@meteortoll/core'
import { toast } from 'sonner'
import { notifyError } from '@/lib/notify'
import { sendWithWallet, simulateOrThrow } from '@/lib/tx'
import type { ProblemView } from '@/lib/chain'
import {
    claimTxs,
    closeTx,
    commitAndOpen,
    fetchAttempt,
    loadSalt,
    prepare,
    revealAndVerifyTxs,
    saveSalt,
    sendAll,
    tollWriter,
    uploadTxs,
    waitForSlot,
} from '@/lib/solve'
import type { Step } from './steps'

type Sign = (txs: Transaction[]) => Promise<Transaction[]>

async function verifyUntilDone(
    connection: Connection,
    program: Program,
    problem: PublicKey,
    solver: PublicKey,
    signed: Transaction[],
    onProgress: (done: number) => void
) {
    return sendAll(connection, signed, onProgress, {
        stopWhen: async () => {
            const now = await fetchAttempt(program, problem, solver)
            return !now || statusName(now.status) !== 'revealed'
        },
    })
}

export function useSolveActions(problem: ProblemView, scheme: Uint8Array) {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { publicKey, sendTransaction, signAllTransactions } = useWallet()
    const { setVisible } = useWalletModal()
    const queries = useQueryClient()
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')
    const [links, setLinks] = useState<Partial<Record<Step, string>>>({})
    const problemKey = useMemo(() => new PublicKey(problem.address), [problem.address])
    const program = useMemo(() => (wallet ? tollWriter(connection, wallet) : null), [connection, wallet])
    const work = useMemo(() => schemeWork(scheme), [scheme])

    const attemptQuery = useQuery({
        queryKey: ['attempt', problem.address, publicKey?.toBase58()],
        enabled: !!program && !!publicKey,
        queryFn: () => fetchAttempt(program!, problemKey, publicKey!),
        refetchInterval: 8_000,
    })
    const attempt = attemptQuery.data ?? null

    const link = (step: Step, signature: string | undefined) => signature && setLinks((l) => ({ ...l, [step]: signature }))

    const sendOne = (tx: Transaction, extra?: Parameters<typeof sendTransaction>[2]) => sendWithWallet(connection, tx, publicKey!, sendTransaction, extra)

    const commitStep = async (solver: PublicKey, program: Program): Promise<AttemptAccount> => {
        setNote('Approve the commitment in your wallet.')
        const { tx, buffer, salt, attempt: attemptKey } = await commitAndOpen(connection, program, problemKey, solver, scheme)
        saveSalt(attemptKey, salt)
        link('commit', await sendOne(tx, { signers: [buffer] }))
        const state = await fetchAttempt(program, problemKey, solver)
        if (!state) throw new Error('the attempt did not appear after committing')
        return state
    }

    const uploadAndVerify = async (solver: PublicKey, program: Program, state: AttemptAccount, sign: Sign) => {
        const attemptKey = attemptAddress(problemKey, solver)
        const salt = loadSalt(attemptKey)
        if (!salt || !Buffer.from(commitment(problemKey, solver, salt, scheme)).equals(Buffer.from(state.commitment))) {
            throw new Error(
                'This browser does not hold the salt for this commitment, or the file differs from the one committed. Abandon the attempt to get the bond back, then start again.'
            )
        }
        setNote('Waiting one slot after the commitment before uploading…')
        await waitForSlot(connection, state.committedSlot.toNumber() + 1)
        const uploads = await uploadTxs(connection, program, solver, attemptKey, state.submission, scheme)
        if (uploads.length > 0) {
            await prepare(connection, uploads, solver)
            await simulateOrThrow(connection, uploads[0])
            setNote(`Approve ${uploads.length} upload transactions in one prompt.`)
            const signed = await sign(uploads)
            await sendAll(connection, signed, (done) => setNote(`Uploaded ${done} of ${signed.length} chunks…`))
        }
        await waitForSlot(connection, state.committedSlot.toNumber() + 2)
        const steps = await revealAndVerifyTxs(program, problemKey, solver, attemptKey, state.submission, salt, work, false)
        await prepare(connection, steps, solver)
        await simulateOrThrow(connection, steps[0])
        setNote('Approve the reveal and the verification in one prompt.')
        const signed = await sign(steps)
        const [reveal] = await sendAll(connection, signed.slice(0, 1), () => setNote('Revealed. Verifying on-chain…'))
        link('reveal', reveal)
        const verified = await verifyUntilDone(connection, program, problemKey, solver, signed.slice(1), (done) => setNote(`Verification transaction ${done} confirmed…`))
        link('verify', verified.at(-1))
    }

    const finishVerify = async (solver: PublicKey, program: Program, state: AttemptAccount, sign: Sign) => {
        const attemptKey = attemptAddress(problemKey, solver)
        const steps = await revealAndVerifyTxs(program, problemKey, solver, attemptKey, state.submission, new Uint8Array(32), work, true)
        setNote('Approve the verification transactions.')
        await prepare(connection, steps, solver)
        const signed = await sign(steps)
        const verified = await verifyUntilDone(connection, program, problemKey, solver, signed, (done) => setNote(`Verification transaction ${done} confirmed…`))
        link('verify', verified.at(-1))
    }

    const settle = async () => {
        setBusy(false)
        setNote('')
        await attemptQuery.refetch()
        await Promise.all(['problem', 'problems', 'history'].map((key) => queries.invalidateQueries({ queryKey: [key] })))
    }

    const won = !!publicKey && !!problem.account.solver?.equals(publicKey)
    const final = problem.phase === 'solved'

    const run = async () => {
        if (!publicKey || !program || !signAllTransactions) return setVisible(true)
        setBusy(true)
        try {
            const state = attempt ?? (await commitStep(publicKey, program))
            const status = statusName(state.status)
            if (status === 'committed') await uploadAndVerify(publicKey, program, state, signAllTransactions)
            else if (status === 'revealed') await finishVerify(publicKey, program, state, signAllTransactions)
            else if (status === 'holds' && won && final) {
                setNote('Approve the claim.')
                const txs = await claimTxs(connection, program, problemKey, problem.account, publicKey, state.submission)
                let signature = ''
                for (const tx of txs) signature = await sendOne(tx)
                link('claim', signature)
                toast.success('Bounty claimed')
            }
        } catch (error) {
            notifyError(error)
        } finally {
            await settle()
        }
    }

    const abandon = async () => {
        if (!publicKey || !program || !attempt) return
        setBusy(true)
        try {
            await sendOne(await closeTx(program, problemKey, publicKey, attempt.submission))
            toast.success('Attempt closed; bond and rent returned')
        } catch (error) {
            notifyError(error)
        } finally {
            await settle()
        }
    }

    return { publicKey, attempt, busy, note, links, work, won, final, run, abandon }
}
