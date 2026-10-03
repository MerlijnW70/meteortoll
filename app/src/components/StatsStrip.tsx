'use client'

import { useStats } from '@/hooks/useStats'
import { count } from '@/lib/format'
import { Skeleton, sol } from './ui'

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
            <div className="text-xs text-muted">{label}</div>
            <div className="num mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight">{value}</div>
            {sub && <div className="num mt-0.5 text-xs text-faint">{sub}</div>}
        </div>
    )
}

export function StatsStrip() {
    const { data, isLoading, isError } = useStats()
    if (isError && !data) return null
    if (isLoading || !data) return <Skeleton className="h-20" />
    return (
        <section aria-label="Launchpad totals" className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-6 sm:grid-cols-5 sm:gap-x-0 sm:divide-x sm:divide-border">
            <Tile label="In open prizes" value={`${sol(data.bountyLamports)} SOL`} sub={`${count(data.open)} open problem${data.open === 1 ? '' : 's'}`} />
            <Tile label="Paid to solvers" value={`${sol(data.paidLamports)} SOL`} sub={`${count(data.solved)} solved`} />
            <Tile label="Traded on the curves" value={`${sol(data.volumeLamports)} SOL`} />
            <Tile label="Trades" value={count(data.trades)} sub={`${count(data.traders)} trader${data.traders === 1 ? '' : 's'}`} />
            <Tile label="Problems" value={count(data.problems)} />
        </section>
    )
}
