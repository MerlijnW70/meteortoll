'use client'

import { useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import type { ProblemView } from '@/lib/chain'
import { tokens } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/notify'
import { sweepTxs, tollWriter } from '@/lib/solve'
import { previewGain, sweepPlan } from '@/lib/sweeps'
import { sendWithWallet } from '@/lib/tx'
import { Panel, sol } from '../ui'

const listed = (items: string[]) => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

export function SweepBar({ problem }: { problem: ProblemView }) {
    const { connection } = useConnection()
    const wallet = useAnchorWallet()
    const { publicKey, sendTransaction } = useWallet()
    const { setVisible } = useWalletModal()
    const queries = useQueryClient()
    const [busy, setBusy] = useState(false)
    const problemKey = new PublicKey(problem.address)

    const plan = useQuery({
        queryKey: ['sweeps', problem.address],
        queryFn: () => sweepPlan(connection, problemKey, problem.account),
        refetchInterval: 20_000,
    })
    const sources = plan.data
        ? [plan.data.trading && 'curve trading fees', plan.data.surplus && 'the curve surplus', plan.data.positions.length > 0 && 'the graduated DAMM v2 position'].filter(
              (s): s is string => !!s
          )
        : []
    const preview = useQuery({
        queryKey: ['sweepPreview', problem.address, publicKey?.toBase58(), sources.join()],
        enabled: !!wallet && sources.length > 0,
        queryFn: async () => {
            const txs = await sweepTxs(connection, tollWriter(connection, wallet!), problemKey, problem.account, publicKey!)
            return previewGain(connection, txs, publicKey!, { quote: problem.account.quoteVault, base: problem.account.baseVault })
        },
        refetchInterval: 20_000,
    })

    const onlyPosition = !!plan.data && !plan.data.trading && !plan.data.surplus
    const nothing = !!preview.data && preview.data.quote === 0n && preview.data.base === 0n
    if (sources.length === 0 || nothing || (onlyPosition && preview.isError)) return null

    const sweep = async () => {
        if (!wallet || !publicKey) return setVisible(true)
        setBusy(true)
        try {
            const txs = await sweepTxs(connection, tollWriter(connection, wallet), problemKey, problem.account, publicKey)
            let signature = ''
            for (const tx of txs) signature = await sendWithWallet(connection, tx, publicKey, sendTransaction)
            notifySuccess(problem.phase === 'open' ? 'Fees swept into the bounty' : 'Fees swept into the vault', signature)
            await Promise.all(['problem', 'problems', 'history', 'sweeps', 'sweepPreview'].map((key) => queries.invalidateQueries({ queryKey: [key] })))
        } catch (error) {
            notifyError(error)
        } finally {
            setBusy(false)
        }
    }

    const amount =
        preview.data !== undefined
            ? `${sol(preview.data.quote)} SOL${preview.data.base > 0n ? ` and ${tokens(preview.data.base)} ${problem.info.symbol || 'tokens'}` : ''}`
            : plan.data?.trading && problem.unsweptLamports > 0n
              ? `${sol(problem.unsweptLamports)} SOL or more`
              : 'Fees'
    const where = problem.phase === 'open' ? 'the bounty' : "the vault the solver claims from"
    return (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p>
                <span className="num font-medium">{amount}</span>{' '}
                <span className="text-muted" title={`From ${listed(sources)}. Anyone can sweep it.`}>
                    in fees, ready for {where}
                </span>
            </p>
            <button onClick={sweep} disabled={busy} className="rounded-lg border border-accent/60 px-3 py-1.5 font-medium text-accent hover:bg-accent/10 disabled:opacity-40">
                {busy ? 'Sweeping…' : !wallet ? 'Connect wallet to sweep' : problem.phase === 'open' ? 'Sweep into the bounty' : 'Sweep into the vault'}
            </button>
        </Panel>
    )
}
