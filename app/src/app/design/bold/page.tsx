'use client'

import Link from 'next/link'
import { sol } from '@/components/ui'
import { count, percentDown } from '@/lib/format'
import type { ProblemView } from '@/lib/chain'
import { bounty, naive, SampleBar, useSampleProblems, useSampleStats } from '../_shared'

const display = { fontFamily: 'var(--font-display), system-ui, sans-serif' }

/// A colour pair that follows from the shape, so every problem keeps its own.
function hues(p: ProblemView): [number, number] {
    const { n1, n2, n3 } = p.account
    const h = (n1 * 47 + n2 * 89 + n3 * 131 + p.account.targetRank * 7) % 360
    return [h, (h + 70) % 360]
}

/// The problem as a picture: matrix A (n×m) times matrix B (m×p), one cell per entry.
function MatrixGlyph({ problem, className = '' }: { problem: ProblemView; className?: string }) {
    const { n1, n2, n3 } = problem.account
    const [h1, h2] = hues(problem)
    const cell = 10
    const gap = 2
    const unit = cell + gap
    const width = (n2 + n3) * unit + 36
    const height = Math.max(n1, n2) * unit
    const grid = (rows: number, cols: number, x0: number, hue: number, seed: number) =>
        Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols)
            const c = i % cols
            const light = 45 + (((r * 7 + c * 13 + seed) * 37) % 25)
            return <rect key={`${seed}-${i}`} x={x0 + c * unit} y={r * unit} width={cell} height={cell} rx={2.5} fill={`hsl(${hue} 85% ${light}%)`} />
        })
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
            {grid(n1, n2, 0, h1, 1)}
            <text x={n2 * unit + 9} y={height / 2 + 7} fontSize={20} fill="white" opacity={0.85}>
                ×
            </text>
            {grid(n2, n3, n2 * unit + 36, h2, 5)}
        </svg>
    )
}

function Card({ problem }: { problem: ProblemView }) {
    const [h1, h2] = hues(problem)
    const record = problem.info.bestKnown?.rank
    return (
        <Link
            href={`/p/${problem.address}`}
            className="group block overflow-hidden rounded-3xl bg-panel transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_var(--glow)]"
            style={{ ['--glow' as string]: `hsl(${h1} 90% 55% / 0.6)` }}
        >
            <div className="relative p-6" style={{ background: `linear-gradient(135deg, hsl(${h1} 70% 18%), hsl(${h2} 70% 12%))` }}>
                <MatrixGlyph problem={problem} className="h-28 w-full transition duration-500 group-hover:scale-[1.03]" />
                <span className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-xs font-medium backdrop-blur">
                    {problem.info.kind === 'demo' ? 'demo · ' : ''}
                    {problem.phase === 'open' ? 'open' : 'solved'}
                </span>
            </div>
            <div className="space-y-4 p-6">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <div className="text-2xl font-bold tracking-tight" style={display}>
                            {problem.account.n1}×{problem.account.n2}×{problem.account.n3}
                        </div>
                        <div className="text-sm text-muted">
                            in ≤{problem.account.targetRank} · record {record ?? '—'} · schoolbook {count(naive(problem))}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="num text-3xl font-bold tracking-tight" style={{ ...display, color: `hsl(${h1} 90% 70%)` }}>
                            {sol(bounty(problem))}
                        </div>
                        <div className="text-xs text-muted">SOL bounty</div>
                    </div>
                </div>
                <div>
                    <div className="mb-1.5 flex justify-between text-xs text-muted">
                        <span>Curve</span>
                        <span className="num">{problem.graduated ? 'graduated' : percentDown(problem.curveProgress, 1)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-panel-2">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${problem.graduated ? 100 : Math.max(3, problem.curveProgress * 100)}%`, background: `linear-gradient(90deg, hsl(${h1} 90% 60%), hsl(${h2} 90% 60%))` }}
                        />
                    </div>
                </div>
            </div>
        </Link>
    )
}

export default function BoldSample() {
    const { problems, isLoading } = useSampleProblems()
    const stats = useSampleStats()
    const lead = problems[0]
    return (
        <div>
            <SampleBar current="bold" />
            <section className="relative overflow-hidden rounded-[2rem] p-8 sm:p-12" style={{ background: 'radial-gradient(120% 120% at 0% 0%, #3b2aa8 0%, #12102a 45%, #0a0b0e 100%)' }}>
                <div className="relative z-10 max-w-xl space-y-6">
                    <h1 className="text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl" style={display}>
                        Trade the problems{' '}
                        <span className="bg-gradient-to-r from-accent via-accent-2 to-good bg-clip-text text-transparent">maths hasn&apos;t solved.</span>
                    </h1>
                    <p className="max-w-lg text-lg text-text/80">
                        Each token is an open matrix multiplication problem on Meteora. Trading fees grow its bounty. The first scheme a Solana program verifies takes it.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Link href={lead ? `/p/${lead.address}` : '/'} className="rounded-full bg-white px-6 py-3 font-semibold text-black hover:opacity-90">
                            Start trading
                        </Link>
                        <Link href="/solve" className="rounded-full border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">
                            I can solve one
                        </Link>
                    </div>
                </div>
                {lead && (
                    <div
                        className="pointer-events-none absolute inset-y-8 right-8 hidden w-[42%] lg:block"
                        style={{ maskImage: 'linear-gradient(to left, black 55%, transparent)', WebkitMaskImage: 'linear-gradient(to left, black 55%, transparent)' }}
                    >
                        <MatrixGlyph problem={lead} className="h-full w-full opacity-70" />
                    </div>
                )}
            </section>

            <section className="my-8 flex flex-wrap gap-3">
                {[
                    ['in bounties', stats.data ? `${sol(stats.data.bountyLamports)} SOL` : '…', 'from-accent/30'],
                    ['paid to solvers', stats.data ? `${sol(stats.data.paidLamports)} SOL` : '…', 'from-good/30'],
                    ['traded', stats.data ? `${sol(stats.data.volumeLamports)} SOL` : '…', 'from-accent-2/30'],
                    ['trades', stats.data ? count(stats.data.trades) : '…', 'from-warn/30'],
                ].map(([label, value, tone]) => (
                    <div key={label} className={`rounded-full bg-gradient-to-r ${tone} to-transparent px-5 py-2.5`}>
                        <span className="num text-lg font-bold" style={display}>
                            {value}
                        </span>{' '}
                        <span className="text-sm text-text/70">{label}</span>
                    </div>
                ))}
            </section>

            <h2 className="mb-5 text-3xl font-extrabold tracking-tight" style={display}>
                Problems
            </h2>
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {isLoading && [0, 1, 2].map((i) => <div key={i} className="skeleton h-80 rounded-3xl" />)}
                {problems.map((p) => (
                    <Card key={p.address} problem={p} />
                ))}
            </section>
        </div>
    )
}
