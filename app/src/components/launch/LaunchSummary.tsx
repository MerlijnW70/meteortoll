'use client'

import Link from 'next/link'
import type BN from 'bn.js'
import type { FirstBuyQuote } from '@/lib/firstBuy'
import type { KnownFormat } from '@/lib/known'
import type { LaunchKind } from '@/lib/launchDraft'
import { explorer } from '@/lib/config'
import { LAUNCH_FEE_SOL } from '@/lib/economics'
import { cardTitle } from '@/lib/card'
import type { ProblemView } from '@/lib/chain'
import { percentDown } from '@/lib/format'
import { MatrixArt } from '../MatrixArt'
import { Meter, Panel, Skeleton, sol } from '../ui'
import { Share } from '../Share'
import type { Launched } from './useLaunch'

const warn = 'bg-warn/15 text-warn border-warn/30'
const badge: Record<LaunchKind, [string, string]> = {
    open: ['Open', 'bg-accent/15 text-accent border-accent/30'],
    demo: ['Disclosed demo', warn],
    answered: ['Answered', warn],
    impossible: ['Impossible', warn],
}

export function Preview({ format, target, symbol, kind, quote }: { format: KnownFormat | null; target: string; symbol: string; kind: LaunchKind; quote: FirstBuyQuote | null }) {
    if (!format) {
        return (
            <Panel className="grid aspect-[16/10] place-items-center rounded-3xl border-dashed p-4 text-center text-sm text-faint">
                <p>Your problem&apos;s card appears here.</p>
            </Panel>
        )
    }
    const [n1, n2, n3] = format.n
    const sketch = { phase: 'open', account: { n1, n2, n3, targetRank: Number(target) || format.bestKnown.rank } } as ProblemView
    return (
        <Panel className="rounded-3xl p-2.5" aria-label="Preview">
            <MatrixArt problem={sketch} className="aspect-[16/10] rounded-2xl px-3 pb-2 pt-9">
                <span className={`absolute left-3 top-3 rounded-full border bg-panel px-2.5 py-1 text-xs font-medium ${badge[kind][1]}`}>{badge[kind][0]}</span>
                <span className="absolute right-3 top-3 rounded-full bg-panel/80 px-2.5 py-1 text-xs text-muted">{symbol}</span>
            </MatrixArt>
            <div className="px-3.5 pb-3.5 pt-4">
            <div className="mb-3 space-y-1">
                <div className="text-2xl font-semibold tracking-tight">{cardTitle({ n1, n2, n3 })}</div>
                <div className="whitespace-nowrap font-mono text-sm text-muted">
                    ⟨{format.n.join('×')} : ≤{target || '?'}⟩
                </div>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                    <div className="text-xs text-muted">Prize</div>
                    <div className="num font-medium">{quote ? sol(BigInt(quote.bounty.toString())) : '0'} SOL</div>
                </div>
                <div>
                    <div className="text-xs text-muted">Record</div>
                    <div className="num font-medium">{format.bestKnown.rank}</div>
                </div>
                <div>
                    <div className="text-xs text-muted">Schoolbook</div>
                    <div className="num text-muted">{format.naive}</div>
                </div>
            </div>
            {quote && (
                <p className="num mb-3 text-xs text-muted">
                    You hold <span className="text-text">{percentDown(quote.supplyShare, 2)}</span> of supply after the first buy
                </p>
            )}
            <Meter label="Curve to graduation" value={quote?.curveShare ?? 0} detail={percentDown(quote?.curveShare ?? 0, 1)} />
            </div>
        </Panel>
    )
}

interface CostState {
    connected: boolean
    total: bigint | undefined
    loading: boolean
    error: string | null
    firstBuy: BN | null
}

export function Cost({ connected, total, loading, error, firstBuy }: CostState) {
    const buy = firstBuy ? BigInt(firstBuy.toString()) : 0n
    const launchFee = BigInt(Math.round(LAUNCH_FEE_SOL * 1e9))
    return (
        <dl className="space-y-1.5 text-sm">
            {launchFee > 0n && (
                <div className="flex justify-between">
                    <dt className="text-muted">Launch fee</dt>
                    <dd className="num">{sol(launchFee)} SOL</dd>
                </div>
            )}
            {buy > 0n && (
                <div className="flex justify-between">
                    <dt className="text-muted">First buy</dt>
                    <dd className="num">{sol(buy)} SOL</dd>
                </div>
            )}
            <div className="flex justify-between">
                <dt className="text-muted">Rent and network fees</dt>
                <dd className="num">{total !== undefined ? `${sol(total - buy - launchFee, 5)} SOL` : connected && loading ? <Skeleton className="h-4 w-20" /> : '—'}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                <dt>Total</dt>
                <dd className="num">{total !== undefined ? `${sol(total, 5)} SOL` : '—'}</dd>
            </div>
            {!connected && <p className="text-xs text-muted">Connect a wallet to see the exact total, simulated against the chain.</p>}
            {error && (
                <p role="alert" className="text-xs text-warn">
                    {error}
                </p>
            )}
        </dl>
    )
}

export function LaunchedPanel({ launched, statement, onAnother }: { launched: Launched; statement: string; onAnother: () => void }) {
    const url = `${window.location.origin}/p/${launched.problem}`
    return (
        <Panel className="space-y-5 p-6 text-center sm:p-8">
            <div className="space-y-2">
                <p className="text-sm text-accent-2">Launched</p>
                <h2 className="font-mono text-3xl">{statement}</h2>
                <p className="mx-auto max-w-md text-muted">The token is live on its bonding curve and the bounty is open. Every trade from now on adds to it.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Link href={`/p/${launched.problem}`} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg">
                    Open the problem
                </Link>
                <a href={explorer('tx', launched.signature)} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-5 py-2.5 text-sm text-muted hover:text-text">
                    View the transaction
                </a>
            </div>
            <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted">Bounties grow with trading. Share it:</p>
                <Share text={`New open problem on meteortoll: ${statement}. Trading funds the bounty; a Solana program pays the first scheme that verifies.`} url={url} />
            </div>
            <button type="button" onClick={onAnother} className="text-sm text-muted underline hover:text-text">
                Launch another
            </button>
        </Panel>
    )
}
