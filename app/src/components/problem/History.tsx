'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import type { ProblemView } from '@/lib/chain'
import { explorer } from '@/lib/config'
import { type EventKind, fetchHistory } from '@/lib/history'
import { Panel, short, Skeleton } from '../ui'

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

function when(seconds: number | null): string {
    if (!seconds) return ''
    return new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function History({ problem }: { problem: ProblemView }) {
    const { connection } = useConnection()
    const { data, isLoading, error } = useQuery({
        queryKey: ['history', problem.address],
        queryFn: () => fetchHistory(connection, new PublicKey(problem.address)),
        refetchInterval: 20_000,
    })
    return (
        <Panel className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-medium">History</h2>
                <span className="text-xs text-faint">every step is a transaction you can open</span>
            </div>
            {isLoading && <Skeleton className="h-32" />}
            {error && <p className="text-sm text-bad">History could not be loaded.</p>}
            {data && (
                <ol className="relative space-y-2 border-l border-border pl-4">
                    {[...data].reverse().map((event) => {
                        const [label, tone] = labels[event.kind]
                        return (
                            <li key={`${event.signature}-${event.kind}`} className="relative text-sm">
                                <span aria-hidden className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border" />
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                    <span className={tone}>
                                        {label}
                                        {event.detail && <span className="text-muted"> · {event.detail}</span>}
                                    </span>
                                    <span className="num text-xs text-faint">{when(event.time)}</span>
                                </div>
                                <div className="flex gap-3 text-xs text-muted">
                                    <span className="font-mono">{short(event.actor)}</span>
                                    <a className="text-accent hover:underline" href={explorer('tx', event.signature)} target="_blank" rel="noreferrer">
                                        transaction
                                    </a>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            )}
        </Panel>
    )
}
