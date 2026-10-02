'use client'

import { useQuery } from '@tanstack/react-query'
import { count } from '@/lib/format'
import { fromJson, type StatsJson } from '@/lib/stats'
import { Skeleton, sol } from './ui'

async function fetchStats() {
    const response = await fetch('/api/stats')
    if (!response.ok) throw new Error(`stats answered ${response.status}`)
    return fromJson((await response.json()) as StatsJson)
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted">{label}</div>
            <div className="num text-2xl font-semibold">{value}</div>
            {sub && <div className="num text-xs text-faint">{sub}</div>}
        </div>
    )
}

export function StatsStrip() {
    const { data, isLoading, isError } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60_000, retry: 1 })
    if (isError) return null
    if (isLoading || !data) return <Skeleton className="h-20" />
    return (
        <section aria-label="Launchpad totals" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile label="In open bounties" value={`${sol(data.bountyLamports)} SOL`} sub={`${count(data.open)} open problem${data.open === 1 ? '' : 's'}`} />
            <Tile label="Paid to solvers" value={`${sol(data.paidLamports)} SOL`} sub={`${count(data.solved)} solved`} />
            <Tile label="Traded on the curves" value={`${sol(data.volumeLamports)} SOL`} />
            <Tile label="Trades" value={count(data.trades)} sub={`${count(data.traders)} trader${data.traders === 1 ? '' : 's'}`} />
            <Tile label="Problems" value={count(data.problems)} />
        </section>
    )
}
