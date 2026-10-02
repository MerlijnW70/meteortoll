'use client'

import { useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { notifyError, notifySuccess } from '@/lib/notify'
import { claimTxs, fetchAttempt, tollWriter } from '@/lib/solve'
import { sendWithWallet } from '@/lib/tx'
import { sol } from '../ui'

/// For the connected solver of a solved problem: claim what the vaults hold, closing the
/// attempt the first time so its bond and buffer rent come back too.
export function ClaimPanel({ problem }: { problem: ProblemView }) {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { publicKey, sendTransaction } = useWallet()
    const queries = useQueryClient()
    const [busy, setBusy] = useState(false)
    const problemKey = new PublicKey(problem.address)
    const isSolver = !!publicKey && !!problem.account.solver?.equals(publicKey)
    const attempt = useQuery({
        queryKey: ['attempt', problem.address, publicKey?.toBase58()],
        enabled: isSolver && !!wallet,
        queryFn: () => fetchAttempt(tollWriter(connection, wallet!), problemKey, publicKey!),
    })
    if (!isSolver || problem.phase !== 'solved' || !wallet) return null

    const claim = async () => {
        setBusy(true)
        try {
            const program = tollWriter(connection, wallet)
            const txs = await claimTxs(connection, program, problemKey, problem.account, publicKey!, attempt.data?.submission ?? null)
            let signature = ''
            // In order: the sweeps fill the vaults the claim then empties.
            for (const tx of txs) signature = await sendWithWallet(connection, tx, publicKey!, sendTransaction)
            notifySuccess('Claimed', signature)
            await Promise.all(['problem', 'problems', 'attempt', 'portfolio', 'history'].map((key) => queries.invalidateQueries({ queryKey: [key] })))
        } catch (error) {
            notifyError(error)
        } finally {
            setBusy(false)
        }
    }

    const owed = totalBounty(problem)
    const nothing = owed === 0n && !attempt.data
    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-good/30 bg-good/5 p-3 text-sm">
            <span>
                You solved this problem.{' '}
                {nothing ? 'New fees will be claimable here as trading continues.' : `${sol(owed)} SOL is claimable${attempt.data ? ', plus your bond and buffer rent' : ''}.`}
            </span>
            <button onClick={claim} disabled={busy || nothing} className="rounded-lg bg-good px-4 py-1.5 font-medium text-bg disabled:opacity-40">
                {busy ? 'Claiming…' : 'Claim'}
            </button>
        </div>
    )
}
