'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PublicKey } from '@solana/web3.js'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQueryClient } from '@tanstack/react-query'
import { type AttemptAccount, statusName } from '@meteortoll/core'
import type { ProblemView } from '@/lib/chain'
import { notifyError, notifySuccess } from '@/lib/notify'
import { closeTx, tollWriter } from '@/lib/solve'
import { sendWithWallet } from '@/lib/tx'
import { shape, sol } from '../ui'

function next(attempt: AttemptAccount, problem: ProblemView, owner: PublicKey): { text: string; close?: string; resume?: boolean } {
    const status = statusName(attempt.status)
    const won = !!problem.account.solver?.equals(owner)
    if (status === 'committed')
        return problem.phase === 'open'
            ? { text: 'Committed. Drop the same scheme file on Solve to upload and verify it.', close: 'Abandon and refund bond', resume: true }
            : { text: 'Another scheme was verified first. Abandon to get your bond back.', close: 'Abandon and refund bond' }
    if (status === 'revealed') return { text: 'Revealed. Drop the same scheme file on Solve to finish verification.', resume: true }
    if (status === 'fails') return { text: 'The scheme did not hold; the bond went to the bounty. Close to recover the upload rent.', close: 'Close attempt' }
    if (won) return { text: problem.phase === 'solved' ? 'Verified. Claim below to also get your bond and upload rent back.' : 'Verified. In the grace window.' }
    return { text: 'Your scheme holds, but an earlier commitment took the solve. Close to get your bond back.', close: 'Close attempt' }
}

export function AttemptRow({ problem, attempt, owner }: { problem: ProblemView; attempt: AttemptAccount; owner: PublicKey }) {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { sendTransaction } = useWallet()
    const queries = useQueryClient()
    const [busy, setBusy] = useState(false)
    const step = next(attempt, problem, owner)

    const close = async () => {
        if (!wallet) return
        setBusy(true)
        try {
            const tx = await closeTx(tollWriter(connection, wallet), new PublicKey(problem.address), owner, attempt.submission)
            notifySuccess('Attempt closed', await sendWithWallet(connection, tx, owner, sendTransaction))
            await queries.invalidateQueries({ queryKey: ['portfolio'] })
        } catch (error) {
            notifyError(error)
        } finally {
            setBusy(false)
        }
    }

    return (
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <div className="min-w-0">
                <Link href={`/p/${problem.address}`} className="font-mono hover:underline">
                    ⟨{shape(problem).label} : ≤{problem.account.targetRank}⟩
                </Link>
                <span className="num ml-2 text-xs text-muted">bond {sol(BigInt(attempt.bond.toString()))} SOL</span>
                <p className="mt-0.5 text-muted">{step.text}</p>
            </div>
            <div className="flex gap-2">
                {step.resume && (
                    <Link href={`/solve?problem=${problem.address}`} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-bg hover:opacity-90">
                        Continue
                    </Link>
                )}
                {step.close && (
                    <button onClick={close} disabled={busy || !wallet} className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-text disabled:opacity-40">
                        {busy ? 'Closing…' : step.close}
                    </button>
                )}
            </div>
        </li>
    )
}
