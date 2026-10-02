'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sol } from '@/components/ui'
import { useTrades } from '@/hooks/useMarket'
import { count, percentDown } from '@/lib/format'
import type { ProblemView } from '@/lib/chain'
import { bounty, naive, notation, SampleBar, useSampleProblems, useSampleStats } from '../_shared'

const mono = { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }

function Ticker({ problems }: { problems: ProblemView[] }) {
    const items = [...problems, ...problems]
    return (
        <div className="relative overflow-hidden border-y border-border bg-panel py-2 text-xs" style={mono}>
            <style>{'@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }'}</style>
            <div className="flex w-max gap-8 whitespace-nowrap" style={{ animation: 'ticker 40s linear infinite' }}>
                {items.map((p, i) => (
                    <span key={`${p.address}-${i}`} className="flex gap-2">
                        <span className="text-text">{notation(p)}</span>
                        <span className="text-accent-2">{sol(bounty(p))}◎</span>
                        <span className={p.phase === 'open' ? 'text-good' : 'text-muted'}>{p.phase === 'open' ? '● open' : '✓ solved'}</span>
                    </span>
                ))}
            </div>
        </div>
    )
}

function Kpi({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-4 py-2 first:pl-0">
            <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
            <div className="num text-base text-text" style={mono}>
                {value}
            </div>
        </div>
    )
}

function Detail({ problem }: { problem: ProblemView }) {
    const trades = useTrades(problem.account.pool)
    const record = problem.info.bestKnown?.rank
    const ladder: [string, number, string][] = [
        ['schoolbook', naive(problem), 'bg-border'],
        ['record', record ?? naive(problem), 'bg-muted'],
        ['target', problem.account.targetRank, 'bg-accent'],
    ]
    return (
        <aside className="space-y-5 border-l border-border pl-5 lg:sticky lg:top-20">
            <div>
                <div className="flex items-center justify-between">
                    <span className="text-lg text-text" style={mono}>
                        {notation(problem)}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${problem.phase === 'open' ? 'bg-good/15 text-good' : 'bg-panel-2 text-muted'}`}>
                        {problem.info.kind === 'demo' ? 'demo · ' : ''}
                        {problem.phase}
                    </span>
                </div>
                <div className="num mt-3 text-4xl tracking-tight text-text" style={mono}>
                    {sol(bounty(problem))}
                    <span className="ml-1 text-lg text-muted">SOL</span>
                </div>
                <div className="text-xs text-muted">bounty{problem.unsweptLamports > 0n ? ` · ${sol(problem.unsweptLamports)} unswept` : ''}</div>
            </div>
            <div className="space-y-1.5">
                {ladder.map(([label, value, tone]) => (
                    <div key={label} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs" style={mono}>
                        <span className="text-muted">{label}</span>
                        <span className="h-1.5 rounded-full bg-panel-2">
                            <span className={`block h-full rounded-full ${tone}`} style={{ width: `${(value / naive(problem)) * 100}%` }} />
                        </span>
                        <span className="num text-right text-text">{value}</span>
                    </div>
                ))}
            </div>
            <div>
                <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-faint">
                    <span>Curve</span>
                    <span>{problem.graduated ? 'DAMM v2' : percentDown(problem.curveProgress, 2)}</span>
                </div>
                <div className="h-1 rounded-full bg-panel-2">
                    <div className="h-full rounded-full bg-accent-2" style={{ width: `${problem.graduated ? 100 : problem.curveProgress * 100}%` }} />
                </div>
            </div>
            <div>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-faint">Trades</div>
                <div className="max-h-56 space-y-1 overflow-y-auto text-xs" style={mono}>
                    {trades.isLoading && <div className="skeleton h-16" />}
                    {trades.data?.length === 0 && <div className="text-muted">No trades yet.</div>}
                    {trades.data?.slice(0, 12).map((t) => (
                        <div key={`${t.signature}-${t.quoteLamports}`} className="grid grid-cols-[2.5rem_1fr_auto] gap-2">
                            <span className={t.side === 'buy' ? 'text-good' : 'text-bad'}>{t.side}</span>
                            <span className="num text-text">{sol(t.quoteLamports)} ◎</span>
                            <span className="text-faint">
                                {t.trader.slice(0, 4)}…{t.trader.slice(-4)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <Link href={`/p/${problem.address}`} className="block rounded-md bg-good py-2.5 text-center text-sm font-medium text-bg hover:opacity-90">
                Trade {problem.info.symbol || 'this problem'}
            </Link>
        </aside>
    )
}

export default function TerminalSample() {
    const { problems, isLoading } = useSampleProblems()
    const stats = useSampleStats()
    const [selected, setSelected] = useState<string | null>(null)
    const current = problems.find((p) => p.address === selected) ?? problems[0]
    return (
        <div>
            <SampleBar current="terminal" />
            {problems.length > 0 && <Ticker problems={problems} />}
            <div className="flex flex-wrap divide-x divide-border border-b border-border">
                <Kpi label="Open bounties" value={stats.data ? `${sol(stats.data.bountyLamports)} ◎` : '…'} />
                <Kpi label="Paid out" value={stats.data ? `${sol(stats.data.paidLamports)} ◎` : '…'} />
                <Kpi label="Volume" value={stats.data ? `${sol(stats.data.volumeLamports)} ◎` : '…'} />
                <Kpi label="Trades" value={stats.data ? count(stats.data.trades) : '…'} />
                <Kpi label="Traders" value={stats.data ? count(stats.data.traders) : '…'} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={mono}>
                        <thead>
                            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-faint">
                                <th className="py-2 pr-3 font-normal">Problem</th>
                                <th className="py-2 pr-3 text-right font-normal">Bounty</th>
                                <th className="py-2 pr-3 text-right font-normal">Record</th>
                                <th className="py-2 pr-3 text-right font-normal">Target</th>
                                <th className="py-2 pr-3 text-right font-normal">Curve</th>
                                <th className="py-2 text-right font-normal">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading &&
                                [0, 1, 2].map((i) => (
                                    <tr key={i}>
                                        <td colSpan={6} className="py-2">
                                            <div className="skeleton h-6" />
                                        </td>
                                    </tr>
                                ))}
                            {problems.map((p) => {
                                const active = current?.address === p.address
                                return (
                                    <tr
                                        key={p.address}
                                        onClick={() => setSelected(p.address)}
                                        className={`cursor-pointer border-b border-border/60 ${active ? 'bg-accent/10' : 'hover:bg-panel'}`}
                                    >
                                        <td className={`py-3 pr-3 ${active ? 'text-accent' : 'text-text'}`}>
                                            {p.account.n1}×{p.account.n2}×{p.account.n3}
                                            <span className="ml-2 text-xs text-faint">{p.info.symbol}</span>
                                        </td>
                                        <td className="num py-3 pr-3 text-right text-accent-2">{sol(bounty(p))}</td>
                                        <td className="num py-3 pr-3 text-right text-muted">{p.info.bestKnown?.rank ?? '—'}</td>
                                        <td className="num py-3 pr-3 text-right text-text">≤{p.account.targetRank}</td>
                                        <td className="num py-3 pr-3 text-right text-muted">{p.graduated ? 'DAMM' : percentDown(p.curveProgress, 1)}</td>
                                        <td className={`py-3 text-right text-xs ${p.phase === 'open' ? 'text-good' : 'text-muted'}`}>{p.phase === 'open' ? '● open' : '✓ solved'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    <p className="mt-3 text-xs text-faint">Click a row to see it on the right. Each row is a token on a Meteora bonding curve; its trading fees fund the bounty.</p>
                </div>
                {current && <Detail key={current.address} problem={current} />}
            </div>
        </div>
    )
}
