'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ErrorPanel } from '@/components/ErrorPanel'
import { RolePaths } from '@/components/explain/RolePaths'
import { ProblemCard } from '@/components/ProblemCard'
import { StatsStrip } from '@/components/StatsStrip'
import { Panel, shape, Skeleton, sol } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { problemStanding } from '@/lib/classify'
import { CLUSTER } from '@/lib/config'

type Filter = ProblemView['phase'] | 'all'

const FILTERS: [Filter, string][] = [
    ['open', 'Open'],
    ['grace', 'Verifying'],
    ['solved', 'Solved'],
    ['all', 'All'],
]

function Problems({ listed, isLoading }: { listed: ProblemView[] | undefined; isLoading: boolean }) {
    const [chosen, setChosen] = useState<Filter | null>(null)
    const count = (filter: Filter) => (listed ?? []).filter((p) => filter === 'all' || p.phase === filter).length
    const filter: Filter = chosen ?? (count('open') > 0 ? 'open' : 'all')
    const items = (listed ?? []).filter((p) => filter === 'all' || p.phase === filter).sort((x, y) => Number(bounty(y) - bounty(x)))
    return (
        <section id="problems" aria-labelledby="problems-title" className="scroll-mt-24 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="problems-title" className="text-xl font-semibold">
                    Problems
                </h2>
                <div role="tablist" aria-label="Filter problems" className="inline-flex rounded-lg bg-panel-2 p-1 text-sm">
                    {FILTERS.map(([value, label]) => (
                        <button
                            key={value}
                            role="tab"
                            aria-selected={filter === value}
                            onClick={() => setChosen(value)}
                            className={`rounded-md px-3 py-1.5 ${filter === value ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text'}`}
                        >
                            {label} <span className="num text-xs text-muted">{isLoading ? '' : count(value)}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}
                {items.map((p) => (
                    <ProblemCard key={p.address} problem={p} showPhase={filter === 'all'} />
                ))}
            </div>
            {!isLoading && items.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
                    {filter === 'grace' ? 'No scheme is in its grace window right now.' : 'Nothing here yet.'}{' '}
                    <Link href="/launch" className="text-accent hover:underline">
                        Launch a problem
                    </Link>
                </p>
            )}
        </section>
    )
}

const bounty = totalBounty

function Hero({ problem }: { problem: ProblemView | undefined }) {
    if (!problem) return <Skeleton className="h-56" />
    const { n1, n2, n3 } = problem.account
    const { target, naive } = shape(problem)
    const best = problem.info.bestKnown
    const prize = bounty(problem)
    const solved = problem.phase !== 'open'
    return (
        <Panel className="relative overflow-hidden p-6 sm:p-8">
            <div className="relative max-w-2xl">
                <p className="mb-3 text-sm text-accent-2">
                    {problem.info.kind === 'demo' ? 'Disclosed demo · not a public bounty' : 'Open problems you can trade'}
                </p>
                <h1 className="mb-4 text-4xl font-semibold sm:text-5xl">
                    Multiply a {n1}×{n2} by a {n2}×{n3} matrix with <span className="text-accent">{target}</span> multiplications.
                </h1>
                <p className="mb-6 text-muted">
                    Schoolbook takes {naive}.{best ? ` The record is ${best.rank}.` : ''}{' '}
                    {solved ? `Solved with ${problem.account.solvedRank}, verified on-chain.` : 'Trading funds the bounty; a Solana program pays the first valid answer.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href={`/p/${problem.address}`}
                        className={`rounded-lg px-6 py-2.5 text-base font-semibold text-bg shadow-sm transition hover:brightness-110 ${solved ? 'bg-accent' : 'bg-good'}`}
                    >
                        {solved ? 'See how it was solved' : 'Trade'}
                    </Link>
                    <Link href="/solve" className="rounded-lg border border-border px-5 py-2.5 text-base hover:border-accent/60">
                        Solve a problem
                    </Link>
                    <span className="num text-sm text-muted">
                        {prize === 0n ? 'The bounty starts with the first trade' : <>Bounty <span className="text-text">{sol(prize)} SOL</span></>}
                    </span>
                </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute -bottom-6 right-4 hidden select-none font-mono text-[7rem] leading-none text-accent/[0.07] lg:block">
                {best ? `${best.rank}→${target}` : target}
            </div>
        </Panel>
    )
}

export default function Home() {
    const { data, isLoading, error, refetch } = useProblems()
    const listed = data?.filter((p) => !p.info.hidden)
    const ranked = [...(listed ?? [])].sort((x, y) => Number(bounty(y) - bounty(x)))
    const flagship =
        ranked.find((p) => p.phase === 'open' && p.info.kind !== 'demo' && !problemStanding(p, CLUSTER === 'mainnet')) ??
        ranked.find((p) => p.phase === 'open' && !problemStanding(p, CLUSTER === 'mainnet')) ??
        ranked[0]
    return (
        <div className="space-y-10">
            <Hero problem={isLoading ? undefined : flagship} />
            <RolePaths />
            <StatsStrip />
            <Link href="/trust#why" className="inline-block text-sm text-accent hover:underline">
                New here? See why one multiplication matters →
            </Link>
            {error && <ErrorPanel error={error} what="Could not load the problems" onRetry={() => refetch()} />}
            <Problems listed={listed} isLoading={isLoading} />
        </div>
    )
}
