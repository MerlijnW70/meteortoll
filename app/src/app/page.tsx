'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ErrorPanel } from '@/components/ErrorPanel'
import { RolePaths } from '@/components/explain/RolePaths'
import { ProductArt } from '@/components/MatrixArt'
import { CHIP, CHIP_TONE, DOT, ProblemCard } from '@/components/ProblemCard'
import { StatsStrip } from '@/components/StatsStrip'
import { Skeleton, sol, tabKeys } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { cardChip, cardTitle } from '@/lib/card'
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
                <div
                    role="tablist"
                    aria-label="Filter problems"
                    className="inline-flex rounded-full bg-panel-2 p-1 text-sm"
                    onKeyDown={(event) => tabKeys(event, FILTERS.map(([value]) => value), filter, setChosen)}
                >
                    {FILTERS.map(([value, label]) => (
                        <button
                            key={value}
                            role="tab"
                            id={`filter-${value}`}
                            aria-selected={filter === value}
                            aria-controls={filter === value ? 'problem-grid' : undefined}
                            tabIndex={filter === value ? 0 : -1}
                            onClick={() => setChosen(value)}
                            className={`rounded-full px-3 py-1.5 ${filter === value ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text'}`}
                        >
                            {label} <span className="num text-xs text-muted">{isLoading ? '' : count(value)}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div id="problem-grid" role="tabpanel" aria-labelledby={`filter-${filter}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-80" />)}
                {items.map((p) => (
                    <ProblemCard key={p.address} problem={p} />
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

function Featured({ problem }: { problem: ProblemView }) {
    const prize = bounty(problem)
    const chip = cardChip(problem, CLUSTER === 'mainnet')
    return (
        <Link href={`/p/${problem.address}`} className="group block outline-none">
            <ProductArt problem={problem} className="aspect-[16/10] rounded-3xl px-4 pb-4 pt-12 transition group-hover:brightness-105 group-focus-visible:ring-2 group-focus-visible:ring-accent">
                <span className={`absolute left-4 top-4 ${CHIP}`}>
                    <span className={`${DOT} ${CHIP_TONE[chip.tone]} ${chip.live ? 'live-dot' : ''}`} />
                    {chip.label}
                </span>
                {problem.info.kind === 'demo' && <span className="absolute right-4 top-4 rounded-full bg-bg/60 px-3 py-1 text-xs text-muted">Demo</span>}
            </ProductArt>
            <span className="mt-4 flex items-baseline justify-between gap-4 px-1">
                <span className="text-lg font-semibold tracking-tight group-hover:text-accent">{cardTitle(problem.account)}</span>
                <span className="num text-sm text-muted">
                    {prize === 0n ? (
                        problem.phase === 'solved' ? 'prize paid out' : 'prize starts with the first trade'
                    ) : (
                        <>
                            <span className="text-base font-semibold text-text">{sol(prize, 3)} SOL</span> {problem.phase === 'solved' ? 'prize left' : 'prize'}
                        </>
                    )}
                </span>
            </span>
        </Link>
    )
}

function Hero({ problem, loading }: { problem: ProblemView | undefined; loading: boolean }) {
    return (
        <section className="grid items-center gap-10 py-4 lg:grid-cols-[1.1fr_1fr] lg:py-10">
            <div className="max-w-xl">
                <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Math problems you can trade.</h1>
                <p className="mt-5 text-lg text-muted sm:text-xl">
                    Each token is an unsolved puzzle about multiplying matrices. Trading grows its prize. The first correct answer wins it, checked by code, not by people.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <a href="#problems" className="rounded-full bg-accent px-6 py-3 font-semibold text-bg transition hover:opacity-90">
                        See the problems
                    </a>
                    <Link href="/trust#why" className="text-accent hover:underline">
                        How it works ›
                    </Link>
                </div>
            </div>
            {loading ? <Skeleton className="aspect-[16/10] rounded-3xl" /> : problem && <Featured problem={problem} />}
        </section>
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
        <div className="space-y-16">
            <Hero problem={flagship} loading={isLoading} />
            <RolePaths />
            <StatsStrip />
            {error && <ErrorPanel error={error} what="Could not load the problems" onRetry={() => refetch()} />}
            <Problems listed={listed} isLoading={isLoading} />
        </div>
    )
}
