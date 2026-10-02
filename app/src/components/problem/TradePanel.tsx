'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import BN from 'bn.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { toast } from 'sonner'
import { describeError } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/notify'
import type { ProblemView } from '@/lib/chain'
import { CLUSTER } from '@/lib/config'
import { useBalances, useMarket } from '@/hooks/useMarket'
import { executeSwap, quoteSwap, SLIPPAGE_BPS } from '@/lib/trade'
import { BASE_DECIMALS, tokens } from '@/lib/format'
import { sol } from '../ui'

const BUY_PRESETS = [0.05, 0.1, 0.5, 1]
const SELL_PRESETS = [25, 50, 100]
/// Kept back on buys for transaction fees and a new token account's rent.
const FEE_RESERVE_LAMPORTS = 3_000_000n


export function TradePanel({ problem }: { problem: ProblemView }) {
    const { connection } = useConnection()
    const { publicKey, sendTransaction } = useWallet()
    const { setVisible } = useWalletModal()
    const queries = useQueryClient()
    const market = useMarket(problem.account.pool)
    const balances = useBalances(publicKey, problem.account.baseMint)
    const [side, setSide] = useState<'buy' | 'sell'>('buy')
    const [amount, setAmount] = useState('0.1')
    const [busy, setBusy] = useState(false)

    const amountIn = useMemo(() => {
        const value = Number(amount)
        if (!Number.isFinite(value) || value <= 0) return null
        const scale = side === 'buy' ? LAMPORTS_PER_SOL : 10 ** BASE_DECIMALS
        return new BN(Math.floor(value * scale).toString())
    }, [amount, side])

    const shortfall = (() => {
        if (!publicKey || !balances.data || !amountIn) return null
        const want = BigInt(amountIn.toString())
        if (side === 'buy' && want + FEE_RESERVE_LAMPORTS > balances.data.lamports) return 'Not enough SOL'
        if (side === 'sell' && want > balances.data.tokens) return `Not enough ${problem.info.symbol || 'tokens'}`
        return null
    })()

    const quote = useQuery({
        queryKey: ['quote', problem.address, side, amountIn?.toString()],
        enabled: !!market.data && !!amountIn && !problem.graduated,
        queryFn: () => quoteSwap(connection, market.data!, side, amountIn!),
        retry: false,
    })

    if (problem.graduated) {
        return (
            <div className="rounded-lg bg-panel-2 p-4 text-sm">
                <p className="mb-2">This token graduated to a Meteora DAMM v2 pool. Its fees still fund the bounty.</p>
                {CLUSTER === 'mainnet' ? (
                    <a className="text-accent hover:underline" href={`https://jup.ag/swap/SOL-${problem.account.baseMint.toBase58()}`} target="_blank" rel="noreferrer">
                        Trade on Jupiter →
                    </a>
                ) : (
                    <span className="text-muted">Trading after graduation routes through Jupiter on mainnet.</span>
                )}
            </div>
        )
    }

    const execute = async () => {
        if (!publicKey) return setVisible(true)
        if (!amountIn || !quote.data) return
        setBusy(true)
        const pending = toast.loading(side === 'buy' ? 'Buying…' : 'Selling…')
        try {
            const signature = await executeSwap(connection, publicKey, sendTransaction, problem.account.pool, side, amountIn, quote.data)
            notifySuccess(side === 'buy' ? 'Bought' : 'Sold', signature, pending)
            await Promise.all(['problem', 'problems', 'market', 'balances', 'trades', 'portfolio'].map((key) => queries.invalidateQueries({ queryKey: [key] })))
        } catch (error) {
            notifyError(error, pending)
        } finally {
            setBusy(false)
        }
    }

    const outputLabel = quote.data
        ? side === 'buy'
            ? `${tokens(BigInt(quote.data.outputAmount.toString()))} ${problem.info.symbol || 'tokens'}`
            : `${sol(BigInt(quote.data.outputAmount.toString()), 6)} SOL`
        : '—'
    const toBounty = quote.data ? BigInt(quote.data.tradingFee.toString()) : 0n
    const presets = side === 'buy' ? BUY_PRESETS.map((v) => [String(v), `${v} SOL`]) : SELL_PRESETS.map((p) => [String(p), `${p}%`])

    const pickPreset = (value: string) => {
        if (side === 'buy') return setAmount(value)
        const held = balances.data?.tokens ?? 0n
        setAmount(String((Number(held) * Number(value)) / 100 / 10 ** BASE_DECIMALS))
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 rounded-lg bg-panel-2 p-1 text-sm" role="tablist">
                {(['buy', 'sell'] as const).map((s) => (
                    <button
                        key={s}
                        role="tab"
                        aria-selected={side === s}
                        onClick={() => {
                            setSide(s)
                            setAmount(s === 'buy' ? '0.1' : '')
                        }}
                        className={`rounded-md py-1.5 capitalize ${side === s ? (s === 'buy' ? 'bg-good/20 text-good' : 'bg-bad/20 text-bad') : 'text-muted'}`}
                    >
                        {s}
                    </button>
                ))}
            </div>
            <label className="block">
                <span className="mb-1 flex justify-between text-xs text-muted">
                    <span>{side === 'buy' ? 'You pay (SOL)' : `You sell (${problem.info.symbol || 'tokens'})`}</span>
                    {balances.data && (
                        <span className="num">
                            {side === 'buy' ? `Balance ${sol(balances.data.lamports)} SOL` : `${tokens(balances.data.tokens)} held`}
                        </span>
                    )}
                </span>
                <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="num w-full rounded-lg border border-border bg-bg px-3 py-2 text-lg outline-none focus:border-accent"
                    placeholder="0.0"
                />
            </label>
            <div className="flex gap-1.5">
                {presets.map(([value, label]) => (
                    <button key={value} onClick={() => pickPreset(value)} className="num rounded-md border border-border px-2 py-1 text-xs text-muted hover:border-accent/60 hover:text-text">
                        {label}
                    </button>
                ))}
            </div>
            <dl className="num space-y-1 rounded-lg bg-panel-2 p-3 text-xs">
                <div className="flex justify-between">
                    <dt className="text-muted">You receive (est.)</dt>
                    <dd>{quote.isFetching && !quote.data ? '…' : outputLabel}</dd>
                </div>
                <div className="flex justify-between">
                    <dt className="text-muted">{problem.phase === 'solved' ? 'Pays the solver' : 'Adds to the bounty'}</dt>
                    <dd className="text-accent-2">{quote.data ? `${sol(toBounty, 6)} SOL` : '—'}</dd>
                </div>
                <div className="flex justify-between">
                    <dt className="text-muted">Slippage limit</dt>
                    <dd>{SLIPPAGE_BPS / 100}%</dd>
                </div>
            </dl>
            {quote.data && side === 'buy' && !quote.data.unspent.isZero() && (
                <p className="rounded-lg bg-accent-2/10 p-2.5 text-xs text-accent-2">
                    This buy completes the curve: it takes {sol(BigInt(quote.data.spent.toString()), 6)} SOL and the other{' '}
                    {sol(BigInt(quote.data.unspent.toString()), 6)} SOL stays in your wallet. The problem then graduates to Meteora DAMM v2.
                </p>
            )}
            {quote.error && <p className="text-xs text-bad">{describeError(quote.error).title}</p>}
            <button
                onClick={execute}
                disabled={busy || (!!publicKey && (!quote.data || !amountIn || !!shortfall))}
                className={`w-full rounded-lg py-2.5 text-sm font-medium text-bg disabled:opacity-40 ${side === 'buy' ? 'bg-good' : 'bg-bad'}`}
            >
                {!publicKey ? 'Connect wallet' : busy ? 'Confirm in wallet…' : !amountIn ? 'Enter an amount' : shortfall ?? (side === 'buy' ? 'Buy' : 'Sell')}
            </button>
            <p className="text-center text-[11px] text-faint">
                Tokens can lose all their value. Not financial advice.{' '}
                <Link href="/terms" className="underline hover:text-muted">
                    Terms and risks
                </Link>
            </p>
        </div>
    )
}
