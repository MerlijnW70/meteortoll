'use client'

import Link from 'next/link'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { statusName } from '@meteortoll/core'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { fetchPortfolio } from '@/lib/portfolio'
import { MAX_SCHEME_BYTES } from '@/lib/checkFile'
import { count } from '@/lib/format'
import { useProblems } from '@/hooks/useProblems'
import { cardTitle } from '@/lib/card'
import { MatrixArt } from '../MatrixArt'
import { More, shape, Skeleton, sol } from '../ui'

const statement = (p: ProblemView) => `⟨${shape(p).label} : ≤${p.account.targetRank}⟩`

export function OpenBounties({ answers }: { answers: Set<string> }) {
    const { data: problems, isLoading } = useProblems()
    const open = (problems ?? []).filter((p) => p.phase === 'open' && !p.info.hidden).sort((a, b) => Number(totalBounty(b) - totalBounty(a)))
    return (
        <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Open prizes</h2>
            {isLoading && <Skeleton className="h-24" />}
            {!isLoading && open.length === 0 && <p className="text-sm text-muted">No open problems right now.</p>}
            <ul className="divide-y divide-border">
                {open.map((p) => {
                    const answered = answers.has(p.address)
                    return (
                        <li key={p.address}>
                            <Link
                                href={`/p/${p.address}`}
                                className={`-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-panel-2 ${answered ? 'bg-good/10 ring-1 ring-good/40' : ''}`}
                            >
                                <MatrixArt problem={p} className="h-11 w-16 shrink-0 rounded-lg p-1" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{cardTitle(p.account)}</span>
                                    <span className="block text-xs text-muted">
                                        {answered ? <span className="text-good">your scheme answers this</span> : `in ${p.account.targetRank} steps · record ${p.info.bestKnown?.rank ?? '—'}`}
                                        {p.info.kind === 'demo' && ' · demo'}
                                    </span>
                                </span>
                                <span className="num shrink-0 font-semibold">{sol(totalBounty(p), 3)} SOL</span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

const NEXT: Record<string, string> = {
    committed: 'Committed: upload and reveal next',
    revealed: 'Revealed: verification to finish',
    holds: 'Holds',
    fails: 'Did not hold',
}

export function YourAttempts() {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const problems = useProblems()
    const portfolio = useQuery({
        queryKey: ['portfolio', publicKey?.toBase58(), problems.dataUpdatedAt],
        enabled: !!publicKey && !!problems.data,
        queryFn: () => fetchPortfolio(connection, publicKey!, problems.data!),
        placeholderData: (previous) => previous,
    })
    const attempts = (portfolio.data?.positions ?? []).filter((p) => p.attempt)
    if (!publicKey || attempts.length === 0) return null
    return (
        <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Your attempts</h2>
            <ul className="space-y-2 text-sm">
                {attempts.map(({ problem, attempt }) => (
                    <li key={problem.address} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                            <span className="block font-mono">{statement(problem)}</span>
                            <span className="block text-xs text-muted">{NEXT[statusName(attempt!.status)] ?? statusName(attempt!.status)}</span>
                        </span>
                        <Link href={`/solve?problem=${problem.address}`} className="shrink-0 py-1 text-sm text-accent hover:underline">
                            Continue ›
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    )
}

const EXAMPLE = `{
  "n": [2, 2, 2],
  "u": [[1, 0, 0, 1], …],
  "v": [[1, 0, 0, 1], …],
  "w": [[1, 0, 0, 1], …]
}`

export function SchemeFormat() {
    return (
        <section id="scheme-format" className="scroll-mt-24 space-y-3 border-t border-border pt-8 text-sm">
            <h2 className="text-xl font-semibold tracking-tight">What file do I need?</h2>
            <p className="text-muted">
                JSON with <code className="font-mono text-text">n, u, v, w</code>: one row per multiplication. <strong className="text-text">w is C transposed.</strong>
            </p>
            <More label="Example, index layout and limits">
                <pre className="mb-3 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-xs leading-5">{EXAMPLE}</pre>
                <ul className="list-disc space-y-1 pl-4 text-muted">
                    <li>
                        <code className="font-mono text-text">u</code> rows hold A (n₁×n₂), entry (i, j) at i·n₂ + j.
                    </li>
                    <li>
                        <code className="font-mono text-text">v</code> rows hold B (n₂×n₃), entry (j, k) at j·n₃ + k.
                    </li>
                    <li>
                        <code className="font-mono text-text">w</code> rows hold C <strong className="text-text">transposed</strong> (n₃×n₁), entry (k, i) at k·n₁ + i.
                    </li>
                    <li>Coefficients are whole numbers from −128 to 127; fractions are not accepted.</li>
                    <li>The encoded scheme may be at most {count(MAX_SCHEME_BYTES)} bytes; a .bin file in that encoding works too.</li>
                </ul>
            </More>
            <a href="/samples/strassen-2x2x2.json" download className="inline-block rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-text">
                Download Strassen&apos;s 2×2×2 as an example
            </a>
        </section>
    )
}
