'use client'

import { useMemo, useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Keypair, PublicKey, type Transaction } from '@solana/web3.js'
import { attemptAddress, schemeWork, statusName } from '@meteortoll/core'
import { toast } from 'sonner'
import { CLUSTER } from '@/lib/config'
import { notifyError } from '@/lib/notify'
import { downloadReceipt, makeReceipt, parseReceipt, saltFrom } from '@/lib/receipt'
import { sendWithWallet } from '@/lib/tx'
import { signAllOnChain } from '@/lib/walletSign'
import type { ProblemView } from '@/lib/chain'
import { claimTxs, closeTx, commit, committedSalt, fetchAttempt, finishVerification, saveSalt, type SolveContext, solveCommitted, tollWriter } from '@/lib/solve'
import type { Step } from './steps'

const SLOW_WALLET_MS = 6_000

export function useSolveActions(problem: ProblemView, scheme: Uint8Array) {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { publicKey, wallet: selected, sendTransaction, signAllTransactions } = useWallet()
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

    const context = (solver: PublicKey, program: SolveContext['program'], sign: SolveContext['sign']): SolveContext => ({
        connection,
        program,
        problem: problemKey,
        solver,
        scheme,
        send: (tx, signers: Keypair[]) => sendOne(tx, { signers }),
        sign,
        note: setNote,
        link,
        saved: (attemptKey, salt) => downloadReceipt(makeReceipt({ cluster: CLUSTER, problem: problemKey, attempt: attemptKey, solver, salt, scheme })),
    })

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
            const name = selected?.adapter.name ?? 'your wallet'
            const sign: SolveContext['sign'] = async (txs) => {
                const timer = setTimeout(() => setNote(`Waiting for ${name} to approve ${txs.length} transactions. No window? Open ${name} from the browser toolbar.`), SLOW_WALLET_MS)
                try {
                    return await signAllOnChain(selected?.adapter, publicKey, signAllTransactions)(txs)
                } finally {
                    clearTimeout(timer)
                }
            }
            const ctx = context(publicKey, program, sign)
            if (!state) {
                await commit(ctx)
                toast.success('Committed', { description: 'Now click Upload, reveal and verify: prompt 2 of 2.' })
            }
            else if (status === 'committed') await solveCommitted(ctx, state)
            else if (status === 'revealed') await finishVerification(ctx, state)
            else if (status === 'holds' && won && final) {
                setNote('Approve the claim.')
                const txs = await claimTxs(connection, program, problemKey, problem.account, publicKey, state.submission)
                let signature = ''
                for (const tx of txs) signature = await sendOne(tx)
                link('claim', signature)
                toast.success('Prize claimed')
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
        return committedSalt(problemKey, publicKey, scheme, attempt.commitment)
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
