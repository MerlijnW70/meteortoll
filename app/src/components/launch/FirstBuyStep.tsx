'use client'

import { useState } from 'react'
import type { FirstBuyQuote } from '@/lib/firstBuy'
import { percentDown, tokens } from '@/lib/format'
import { sol } from '../ui'

const chip = (on: boolean) => `rounded-lg border px-3 py-1.5 text-sm transition-colors ${on ? 'border-accent bg-accent/10 text-text' : 'border-border text-muted hover:border-accent/50 hover:text-text'}`

/// The optional first buy: presets or a typed amount, and what it gets, exactly.
export function FirstBuyStep({ presets, value, onChange, quote, error }: { presets: readonly number[]; value: string; onChange: (sol: string) => void; quote: FirstBuyQuote | null; error: string | null }) {
    const preset = presets.map(String).includes(value)
    const [custom, setCustom] = useState(!preset)
    return (
        <div className="space-y-3">
            <div role="radiogroup" aria-label="First buy" className="flex flex-wrap gap-2">
                {presets.map((amount) => (
                    <button
                        key={amount}
                        type="button"
                        role="radio"
                        aria-checked={!custom && value === String(amount)}
                        onClick={() => {
                            setCustom(false)
                            onChange(String(amount))
                        }}
                        className={chip(!custom && value === String(amount))}
                    >
                        {amount === 0 ? 'None' : `${amount} SOL`}
                    </button>
                ))}
                <button type="button" role="radio" aria-checked={custom} onClick={() => setCustom(true)} className={chip(custom)}>
                    Other
                </button>
                {custom && (
                    <label className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 focus-within:border-accent">
                        <input
                            autoFocus
                            inputMode="decimal"
                            aria-label="First buy in SOL"
                            value={value}
                            onChange={(e) => onChange(e.target.value.replace(',', '.'))}
                            className="num w-20 bg-transparent py-1.5 text-sm outline-none"
                        />
                        <span className="text-xs text-muted">SOL</span>
                    </label>
                )}
            </div>
            {error && (
                <p role="alert" className="text-sm text-warn">
                    {error}
                </p>
            )}
            {quote && !error && (
                <dl className="grid grid-cols-3 gap-3 rounded-lg bg-panel-2 p-3 text-sm">
                    <div>
                        <dt className="text-xs text-muted">You receive</dt>
                        <dd className="num font-medium">{tokens(BigInt(quote.tokens.toString()))}</dd>
                        <dd className="num text-xs text-muted">{percentDown(quote.supplyShare, 2)} of supply</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">To the bounty</dt>
                        <dd className="num font-medium">{sol(BigInt(quote.bounty.toString()))} SOL</dd>
                        <dd className="text-xs text-muted">the trading fee</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">Curve filled</dt>
                        <dd className="num font-medium">{percentDown(quote.curveShare, 1)}</dd>
                        <dd className="text-xs text-muted">toward graduation</dd>
                    </div>
                </dl>
            )}
            <p className="text-xs text-muted">Bought in the transaction that creates the pool, so nobody can buy ahead of you. Optional: anyone can trade once it is live.</p>
        </div>
    )
}
