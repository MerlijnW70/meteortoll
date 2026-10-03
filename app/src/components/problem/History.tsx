'use client'

import { useState } from 'react'
import { useHistory } from '@/hooks/useHistory'
import type { ProblemView } from '@/lib/chain'
import { explorer } from '@/lib/config'
import type { EventKind } from '@/lib/history'
import { short, ShowAll, Skeleton, sol } from '../ui'

const labels: Record<EventKind, [string, string]> = {
    register: ['Launched', 'text-muted'],
    sweep: ['Fees swept into the bounty', 'text-muted'],
    commit: ['Committed a sealed scheme', 'text-accent'],
    reveal: ['Revealed', 'text-accent'],
    verify: ['Verification started', 'text-accent'],
    solved: ['Verified on-chain: holds', 'text-good'],
    failed: ['Verified on-chain: does not hold', 'text-bad'],
    claim: ['Claimed the bounty', 'text-good'],
    close: ['Closed the attempt', 'text-muted'],
}

const FIRST = 5

function when(seconds: number | null): string {
    if (!seconds) return ''
    return new Date(seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function History({ problem }: { problem: ProblemView }) {
    const { data, isLoading, error } = useHistory(problem.address)
    const [open, setOpen] = useState(false)
    const newest = data ? [...data].reverse() : []
    const shown = open ? newest : newest.slice(0, FIRST)
    return (
        <div>
            {isLoading && <Skeleton className="h-32" />}
            {error && <p className="text-sm text-bad">History could not be loaded.</p>}
            {data && (
                <ol className="relative space-y-2 border-l border-border pl-4">
                    {shown.map((event) => {
                        const [label, tone] = labels[event.kind]
                        return (
                            <li key={`${event.signature}-${event.kind}`} className="relative text-sm">
                                <span aria-hidden className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border" />
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                    <span className={tone}>
                                        {label}
                                        {event.detail && <span className="text-muted"> · {event.detail}</span>}
                                        {event.lamports !== undefined && <span className="text-muted"> · {sol(event.lamports)} SOL</span>}
                                    </span>
                                    <span className="num text-xs text-faint">{when(event.time)}</span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted">
                                    <span className="font-mono">{short(event.actor)}</span>
                                    <a className="inline-block py-1 text-accent hover:underline" href={explorer('tx', event.signature)} target="_blank" rel="noreferrer">
                                        transaction
                                    </a>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            )}
            {newest.length > FIRST && <ShowAll open={open} total={newest.length} onToggle={() => setOpen(!open)} />}
        </div>
    )
}
