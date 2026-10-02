'use client'

import { useMemo, useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Program } from '@coral-xyz/anchor'
import { type Connection, PublicKey, type Transaction } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, commitment, schemeWork, statusName } from '@meteortoll/core'
import { toast } from 'sonner'
import { CLUSTER } from '@/lib/config'
import { notifyError } from '@/lib/notify'
import { downloadReceipt, makeReceipt, parseReceipt, saltFrom } from '@/lib/receipt'
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

    const deliver = async (state: AttemptAccount, uploads: Transaction[], steps: Transaction[]) => {
        if (uploads.length > 0) await sendAll(connection, uploads, (done) => setNote(`Uploaded ${done} of ${uploads.length} chunks…`))
        setNote('Waiting for a new slot before the reveal…')
        await waitForSlot(connection, state.committedSlot.toNumber() + 2)
        const [reveal] = await sendAll(connection, steps.slice(0, 1), () => setNote('Revealed. Verifying on-chain…'))
        link('reveal', reveal)
        const verified = await verifyUntilDone(connection, program!, problemKey, state.solver, steps.slice(1), (done) => setNote(`Verification transaction ${done} confirmed…`))
        link('verify', verified.at(-1))
    }

    const commitAll = async (solver: PublicKey, program: Program, sign: Sign) => {
        const { tx, buffer, salt, attempt: attemptKey } = await commitAndOpen(connection, program, problemKey, solver, scheme)
        saveSalt(attemptKey, salt)
        downloadReceipt(makeReceipt({ cluster: CLUSTER, problem: problemKey, attempt: attemptKey, solver, salt, scheme }))
        const uploads = await uploadTxs(connection, program, solver, attemptKey, buffer.publicKey, scheme)
        const steps = await revealAndVerifyTxs(program, problemKey, solver, attemptKey, buffer.publicKey, salt, work, false)
        await prepare(connection, [tx, ...uploads, ...steps], solver)
        await simulateOrThrow(connection, tx)
        tx.partialSign(buffer)
        setNote('Your commitment receipt was saved. Approve the commitment, upload, reveal and verification in one prompt.')
        const [committed, ...rest] = await sign([tx, ...uploads, ...steps])
        const [signature] = await sendAll(connection, [committed], () => setNote('Committed. Uploading…'))
        link('commit', signature)
        const state = await fetchAttempt(program, problemKey, solver)
        if (!state) throw new Error('the attempt did not appear after committing')
        await deliver(state, rest.slice(0, uploads.length), rest.slice(uploads.length))
    }

    const uploadAndVerify = async (solver: PublicKey, program: Program, state: AttemptAccount, sign: Sign) => {
        const attemptKey = attemptAddress(problemKey, solver)
        const salt = loadSalt(attemptKey)
        if (!salt || !Buffer.from(commitment(problemKey, solver, salt, scheme)).equals(Buffer.from(state.commitment))) {
            throw new Error(
                'This browser does not hold the salt for this commitment, or the file differs from the one committed. Restore it from your commitment receipt, or abandon the attempt to get the bond back.'
            )
        }
        setNote('Waiting for a slot after the commitment…')
        await waitForSlot(connection, state.committedSlot.toNumber() + 2)
        const uploads = await uploadTxs(connection, program, solver, attemptKey, state.submission, scheme)
        const steps = await revealAndVerifyTxs(program, problemKey, solver, attemptKey, state.submission, salt, work, false)
        await prepare(connection, [...uploads, ...steps], solver)
        await simulateOrThrow(connection, uploads[0] ?? steps[0])
        setNote('Approve the upload, reveal and verification in one prompt.')
        const signed = await sign([...uploads, ...steps])
        await deliver(state, signed.slice(0, uploads.length), signed.slice(uploads.length))
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
            const state = attempt
            const status = state ? statusName(state.status) : null
            if (!state) await commitAll(publicKey, program, signAllTransactions)
            else if (status === 'committed') await uploadAndVerify(publicKey, program, state, signAllTransactions)
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

    const [saltVersion, setSaltVersion] = useState(0)
    const heldSalt = useMemo(() => {
        if (!publicKey || !attempt || statusName(attempt.status) !== 'committed') return null
        const salt = loadSalt(attemptAddress(problemKey, publicKey))
        return salt && Buffer.from(commitment(problemKey, publicKey, salt, scheme)).equals(Buffer.from(attempt.commitment)) ? salt : null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publicKey, attempt, problemKey, scheme, saltVersion])

    const saveReceiptAgain = () => {
        if (!publicKey || !heldSalt) return
        downloadReceipt(makeReceipt({ cluster: CLUSTER, problem: problemKey, attempt: attemptAddress(problemKey, publicKey), solver: publicKey, salt: heldSalt, scheme }))
    }

    const restoreReceipt = async (file: File) => {
        if (!publicKey || !attempt) return
        try {
            const attemptKey = attemptAddress(problemKey, publicKey)
            const salt = saltFrom(parseReceipt(await file.text()), { problem: problemKey, solver: publicKey, attempt: attemptKey, commitment: attempt.commitment, scheme })
            saveSalt(attemptKey, salt)
            setSaltVersion((v) => v + 1)
            toast.success('Commitment restored: you can upload and reveal')
        } catch (error) {
            notifyError(error)
        }
    }

    return { publicKey, attempt, busy, note, links, work, won, final, run, abandon, heldSalt, saveReceiptAgain, restoreReceipt }
}
