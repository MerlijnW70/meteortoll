'use client'

import Link from 'next/link'
import { ErrorPanel } from '@/components/ErrorPanel'
import { ProblemCard } from '@/components/ProblemCard'
import { Panel, shape, Skeleton, sol } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import type { ProblemView } from '@/lib/chain'

const columns: [ProblemView['phase'], string, string][] = [
    ['open', 'Open', 'Unsolved. Trading fees grow the bounty.'],
    ['grace', 'Verifying', 'A scheme holds; earlier commitments can still take it.'],
    ['solved', 'Solved', 'Paid out. Fees keep flowing to the solver.'],
]

const STEPS: [string, string][] = [
    ['Trade the problem', 'Each open problem is a token on a Meteora bonding curve. Buy it if you think it matters.'],
    ['Fees fund the bounty', 'Every trade pays a 1% fee; everything the protocol leaves goes to the problem’s bounty, before and after graduation.'],
    ['A verified answer claims it', 'Anyone can submit a scheme. A Solana program checks it, with no committee, and pays the first valid one.'],
]

const bounty = (p: ProblemView) => p.bountyLamports + p.unsweptLamports

function Hero({ problem }: { problem: ProblemView | undefined }) {
    if (!problem) return <Skeleton className="h-56" />
    const { n1, n2, n3 } = problem.account
    const { target, naive } = shape(problem)
    const best = problem.info.bestKnown
    const prize = sol(bounty(problem))
    const solved = problem.phase !== 'open'
    return (
        <Panel className="relative overflow-hidden p-6 sm:p-8">
            <div className="relative max-w-2xl">
                <p className="mb-3 text-sm text-accent-2">Open problems you can trade</p>
                <h1 className="mb-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                    Multiply a {n1}×{n2} by a {n2}×{n3} matrix with <span className="text-accent">{target}</span> multiplications.
                </h1>
                <p className="mb-6 text-muted">
                    Schoolbook takes {naive}.{best ? ` The best published scheme takes ${best.rank}.` : ''}{' '}
                    {solved
                        ? `This one is solved: a scheme of rank ${problem.account.solvedRank} passed the on-chain check, and trading fees keep paying its solver.`
                        : 'Every trade of this token pays into a bounty that the first verified scheme claims, checked by a Solana program, not a committee.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/p/${problem.address}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90">
                        {solved ? 'See how it was solved' : 'Trade'}
                    </Link>
                    <Link href="/solve" className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent/60">
                        Solve a problem
                    </Link>
                    <span className="num text-sm text-muted">
                        Bounty <span className="text-text">{prize} SOL</span>
                    </span>
                </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute -bottom-6 right-4 hidden select-none font-mono text-[7rem] leading-none text-accent/[0.07] lg:block">
                {best ? `${best.rank}→${target}` : target}
            </div>
        </Panel>
    )
}

function HowItWorks() {
    return (
        <div className="space-y-2">
        <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
                <li key={title} className="flex gap-3 rounded-xl border border-border p-4">
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs text-accent">{i + 1}</span>
                    <div>
                        <div className="text-sm font-medium">{title}</div>
                        <p className="mt-0.5 text-xs text-muted">{body}</p>
                    </div>
                </li>
            ))}
        </ol>
        <Link href="/trust#why" className="inline-block text-sm text-accent hover:underline">
            New here? See why one multiplication matters →
        </Link>
        </div>
    )
}

export default function Home() {
    const { data, isLoading, error, refetch } = useProblems()
    // The hero shows the open problem with the largest bounty, preferring problems the team cannot already solve.
    const ranked = [...(data ?? [])].sort((x, y) => Number(bounty(y) - bounty(x)))
    const flagship =
        ranked.find((p) => p.phase === 'open' && p.info.kind !== 'demo' && !p.info.teamMeetsTarget) ??
        ranked.find((p) => p.phase === 'open' && p.info.kind !== 'demo') ??
        ranked.find((p) => p.phase === 'open') ??
        ranked[0]
    return (
        <div className="space-y-10">
            <Hero problem={isLoading ? undefined : flagship} />
            <HowItWorks />
            {error && <ErrorPanel error={error} what="Could not load the problems" onRetry={() => refetch()} />}
            <div className="grid gap-6 lg:grid-cols-3">
                {columns.map(([phase, title, hint]) => {
                    const items = (data?.filter((p) => p.phase === phase) ?? []).sort((x, y) => Number(bounty(y) - bounty(x)))
                    return (
                        <div key={phase}>
                            <div className="mb-3">
                                <h2 className="font-medium">
                                    {title} <span className="num text-muted">{isLoading ? '' : items.length}</span>
                                </h2>
                                <p className="text-xs text-muted">{hint}</p>
                            </div>
                            <div className="space-y-3">
                                {isLoading && <Skeleton className="h-40" />}
                                {!isLoading && items.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">Nothing here yet.</div>
                                )}
                                {items.map((p) => (
                                    <ProblemCard key={p.address} problem={p} />
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
