'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useProblems } from '@/hooks/useProblems'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { fromJson, type StatsJson } from '@/lib/stats'

export const SAMPLES = [
    ['paper', 'A · Research paper'],
    ['terminal', 'B · Trading terminal'],
    ['bold', 'C · Bold'],
] as const

/// Every problem on the launchpad, hidden test launches included: devnet has few, and a sample
/// needs something to show. Open problems first, then by bounty.
export function useSampleProblems() {
    const query = useProblems()
    const rank = (p: ProblemView) => (p.phase === 'open' ? 0 : p.phase === 'grace' ? 1 : 2)
    const sorted = [...(query.data ?? [])].sort((a, b) => rank(a) - rank(b) || Number(bounty(b) - bounty(a)))
    return { ...query, problems: sorted }
}

export function useSampleStats() {
    return useQuery({
        queryKey: ['stats'],
        queryFn: async () => {
            const response = await fetch('/api/stats')
            if (!response.ok) throw new Error(`stats answered ${response.status}`)
            return fromJson((await response.json()) as StatsJson)
        },
    })
}

export const bounty = totalBounty
export const notation = (p: ProblemView) => `⟨${p.account.n1}×${p.account.n2}×${p.account.n3} : ≤${p.account.targetRank}⟩`
export const naive = (p: ProblemView) => p.account.n1 * p.account.n2 * p.account.n3

/// A strip on every sample saying what it is and how to switch between them.
export function SampleBar({ current }: { current: (typeof SAMPLES)[number][0] }) {
    return (
        <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-dashed border-warn/40 px-3 py-2 text-xs text-warn">
            <span>Design sample, live devnet data (hidden test problems included). Delete app/src/app/design to remove.</span>
            <span className="ml-auto flex gap-3">
                {SAMPLES.map(([slug, label]) => (
                    <Link key={slug} href={`/design/${slug}`} className={slug === current ? 'text-text underline' : 'hover:text-text'}>
                        {label}
                    </Link>
                ))}
            </span>
        </div>
    )
}
