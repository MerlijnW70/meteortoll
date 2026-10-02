'use client'

import Link from 'next/link'
import { sol } from '@/components/ui'
import { count, percentDown } from '@/lib/format'
import type { ProblemView } from '@/lib/chain'
import { bounty, naive, SampleBar, useSampleProblems, useSampleStats } from '../_shared'

const serif = { fontFamily: 'var(--font-serif), Georgia, serif' }

/// Every multiplication of the schoolbook method as a dot. Those the published record already
/// removed are struck out; the ones the target asks to remove on top glow.
function DotField({ problem }: { problem: ProblemView }) {
    const total = naive(problem)
    const target = problem.account.targetRank
    const record = problem.info.bestKnown?.rank ?? target
    const columns = Math.ceil(Math.sqrt(total * 1.5))
    const step = 10
    const rows = Math.ceil(total / columns)
    const at = (i: number) => ({ x: (i % columns) * step + step / 2, y: Math.floor(i / columns) * step + step / 2 })
    const asked = Array.from({ length: Math.max(0, record - target) }, (_, k) => target + k)
    const first = asked.length ? at(asked[0]) : null
    return (
        <figure className="space-y-3">
            <svg viewBox={`-4 -4 ${columns * step + 8} ${rows * step + 8}`} className="w-full overflow-visible" role="img" aria-label={`${total} multiplications: ${target} allowed, ${record} in the best published scheme`}>
                {Array.from({ length: total }, (_, i) => {
                    const { x, y } = at(i)
                    if (i < target) return <circle key={i} cx={x} cy={y} r={2.8} fill="var(--text)" opacity={0.82} />
                    if (i < record) return null
                    return <circle key={i} cx={x} cy={y} r={2.4} fill="none" stroke="var(--border)" strokeWidth={1} />
                })}
                {asked.map((i) => {
                    const { x, y } = at(i)
                    return (
                        <g key={`asked-${i}`}>
                            <circle cx={x} cy={y} r={9} fill="var(--accent)" opacity={0.25}>
                                <animate attributeName="r" values="5;12;5" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.45;0;0.45" dur="2s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={x} cy={y} r={4} fill="var(--accent)" />
                        </g>
                    )
                })}
                {first && (
                    // Below the dot, among the struck-out ones, on whichever side has room.
                    <text
                        x={first.x > (columns * step) / 2 ? first.x - 14 : first.x + 14}
                        y={first.y + 24}
                        textAnchor={first.x > (columns * step) / 2 ? 'end' : 'start'}
                        fontSize={13}
                        fill="var(--accent)"
                        stroke="var(--bg)"
                        strokeWidth={5}
                        paintOrder="stroke"
                        style={serif}
                    >
                        the bounty asks for this one
                    </text>
                )}
            </svg>
            <figcaption className="grid gap-2 text-sm text-muted sm:grid-cols-3" style={serif}>
                <span>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full border border-border align-middle" />
                    {count(total - record)} removed by research since the schoolbook {count(total)}
                </span>
                <span>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
                    {count(record - target)} more the bounty asks for
                </span>
                <span>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-text align-middle" />
                    {count(target)} multiplications allowed
                </span>
            </figcaption>
        </figure>
    )
}

function Figure({ value, label }: { value: string; label: string }) {
    return (
        <div className="border-l border-border pl-4 first:border-l-0 first:pl-0">
            <div className="num text-3xl tracking-tight" style={serif}>
                {value}
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">{label}</div>
        </div>
    )
}

export default function PaperSample() {
    const { problems, isLoading } = useSampleProblems()
    const stats = useSampleStats()
    const lead = problems[0]
    return (
        <div className="mx-auto max-w-5xl">
            <SampleBar current="paper" />

            <header className="flex items-baseline justify-between border-y border-text/80 py-2 text-xs uppercase tracking-[0.18em] text-muted">
                <span>Open Problems in Matrix Multiplication</span>
                <span className="hidden sm:inline">Bounties funded by trading · verified on Solana</span>
                <span>Vol. 1</span>
            </header>

            {isLoading || !lead ? (
                <div className="skeleton mt-10 h-96" />
            ) : (
                <section className="grid gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
                    <div className="space-y-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-accent-2">Problem No. 1 · {lead.phase === 'open' ? 'open' : 'solved'}</p>
                        <h1 className="text-5xl leading-[1.05] tracking-tight sm:text-6xl" style={serif}>
                            Can a {lead.account.n1}×{lead.account.n2} matrix times a {lead.account.n2}×{lead.account.n3} take <em className="text-accent">{lead.account.targetRank}</em>{' '}
                            multiplications?
                        </h1>
                        <p className="max-w-md text-lg leading-relaxed text-muted" style={serif}>
                            The best published scheme takes {lead.info.bestKnown?.rank}. Every trade of this problem&apos;s token pays into a bounty, and a Solana program pays it to the
                            first scheme that checks out. No committee.
                        </p>
                        <div className="flex items-center gap-5 pt-2">
                            <Link href={`/p/${lead.address}`} className="rounded-full bg-text px-5 py-2.5 text-sm font-medium text-bg hover:opacity-90">
                                Read the problem
                            </Link>
                            <span className="num text-sm text-muted">
                                Bounty <span className="text-text">{sol(bounty(lead))} SOL</span>
                            </span>
                        </div>
                    </div>
                    <DotField problem={lead} />
                </section>
            )}

            <section className="grid grid-cols-2 gap-y-6 border-y border-border py-6 sm:grid-cols-4">
                <Figure value={stats.data ? `${sol(stats.data.bountyLamports)}` : '…'} label="SOL in open bounties" />
                <Figure value={stats.data ? `${sol(stats.data.paidLamports)}` : '…'} label="SOL paid to solvers" />
                <Figure value={stats.data ? `${sol(stats.data.volumeLamports)}` : '…'} label="SOL traded" />
                <Figure value={stats.data ? count(stats.data.trades) : '…'} label="trades" />
            </section>

            <section className="py-12">
                <h2 className="mb-6 text-3xl tracking-tight" style={serif}>
                    The problems
                </h2>
                <ol className="divide-y divide-border border-y border-border">
                    {problems.map((p, i) => (
                        <li key={p.address}>
                            <Link href={`/p/${p.address}`} className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 py-5 sm:grid-cols-[2.5rem_1.4fr_1fr_1fr_auto]">
                                <span className="num text-sm text-faint">{String(i + 1).padStart(2, '0')}</span>
                                <span className="text-2xl tracking-tight group-hover:text-accent" style={serif}>
                                    {p.account.n1}×{p.account.n2}×{p.account.n3} <span className="text-muted">in</span> {p.account.targetRank}
                                </span>
                                <span className="num hidden text-sm text-muted sm:block">
                                    record {p.info.bestKnown?.rank ?? '—'} · schoolbook {count(naive(p))}
                                </span>
                                <span className="num hidden text-sm text-muted sm:block">curve {p.graduated ? 'graduated' : percentDown(p.curveProgress, 1)}</span>
                                <span className="num text-right">
                                    <span className="block text-lg" style={serif}>
                                        {sol(bounty(p))} SOL
                                    </span>
                                    <span className="text-xs uppercase tracking-[0.14em] text-muted">
                                        {p.info.kind === 'demo' ? 'demo · ' : ''}
                                        {p.phase === 'open' ? 'open' : 'solved'}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="grid gap-8 border-t border-text/80 py-10 sm:grid-cols-3">
                {[
                    ['Trade', 'Each problem is a token on a Meteora bonding curve. Buying it says the problem matters.'],
                    ['Fund', 'Every trade pays a 1% fee, and what the protocol leaves goes to the bounty, before and after graduation.'],
                    ['Prove', 'A solver commits, uploads and reveals a scheme; the program checks it at a random point and pays the first that holds.'],
                ].map(([title, body], i) => (
                    <div key={title}>
                        <p className="num mb-2 text-xs text-faint">§{i + 1}</p>
                        <h3 className="mb-2 text-xl" style={serif}>
                            {title}
                        </h3>
                        <p className="leading-relaxed text-muted" style={serif}>
                            {body}
                        </p>
                    </div>
                ))}
            </section>
        </div>
    )
}
