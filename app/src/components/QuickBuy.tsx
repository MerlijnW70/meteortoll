'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ProblemView } from '@/lib/chain'
import { notifyError, notifySuccess } from '@/lib/notify'

const QUICK_MAX_FEE_PERCENT = 1.5

export function QuickBuy({ problem, sol = 0.1 }: { problem: ProblemView; sol?: number }) {
    const { connection } = useConnection()
    const { publicKey, sendTransaction } = useWallet()
    const { setVisible } = useWalletModal()
    const queries = useQueryClient()
    const [busy, setBusy] = useState(false)
    if (problem.graduated) return null

    const buy = async () => {
        if (!publicKey) return setVisible(true)
        setBusy(true)
        const pending = toast.loading(`Buying ${sol} SOL of ${problem.info.symbol || 'this problem'}…`)
        try {
            const { executeSwap, lamports } = await import('@/lib/trade')
            const signature = await executeSwap(connection, publicKey, sendTransaction, problem.account.pool, 'buy', lamports(sol), undefined, QUICK_MAX_FEE_PERCENT)
            notifySuccess(`Bought ${problem.info.symbol}`.trim(), signature, pending)
            await Promise.all(['problems', 'problem', 'trades', 'balances', 'portfolio'].map((key) => queries.invalidateQueries({ queryKey: [key] })))
        } catch (error) {
            notifyError(error, pending)
        } finally {
            setBusy(false)
        }
    }

    return (
        <button
            onClick={buy}
            disabled={busy}
            aria-label={`Buy ${sol} SOL of ${problem.info.symbol || 'this problem'}`}
            className="num rounded-md bg-good/15 px-3 py-1.5 text-xs font-semibold text-good hover:bg-good/25 disabled:opacity-50"
        >
            {busy ? 'Buying…' : `Buy ${sol} SOL`}
        </button>
    )
}
