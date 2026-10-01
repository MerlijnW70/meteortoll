'use client'

import type { ProblemView } from '@/lib/chain'
import { explorer } from '@/lib/config'
import { useTrades } from '@/hooks/useMarket'
import { Panel, short, Skeleton, sol } from '../ui'

const FEED_LENGTH = 20

function ago(seconds: number | null): string {
    if (!seconds) return ''
    const delta = Math.max(0, Date.now() / 1000 - seconds)
    if (delta < 60) return `${Math.floor(delta)}s`
    if (delta < 3600) return `${Math.floor(delta / 60)}m`
    if (delta < 86400) return `${Math.floor(delta / 3600)}h`
    return `${Math.floor(delta / 86400)}d`
}

export function TradeFeed({ problem }: { problem: ProblemView }) {
    const { data: all, isLoading, error } = useTrades(problem.account.pool)
    const data = all?.slice(0, FEED_LENGTH)
    return (
        <Panel className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-medium">Trades</h2>
                <span className="text-xs text-faint">live from the pool&apos;s swap events</span>
            </div>
            {isLoading && <Skeleton className="h-24" />}
            {error && <p className="text-sm text-bad">Trades could not be loaded.</p>}
            {data && data.length === 0 && <p className="py-6 text-center text-sm text-faint">No trades yet. The first buy starts the bounty.</p>}
            {data && data.length > 0 && (
                <table className="num w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-muted">
                            <th className="pb-2 font-normal">Side</th>
                            <th className="pb-2 font-normal">SOL</th>
                            <th className="pb-2 font-normal">To bounty</th>
                            <th className="pb-2 font-normal">Trader</th>
                            <th className="pb-2 text-right font-normal">Age</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((trade) => (
                            <tr key={trade.signature} className="border-t border-border">
                                <td className={`py-1.5 ${trade.side === 'buy' ? 'text-good' : 'text-bad'}`}>{trade.side}</td>
                                <td className="py-1.5">{sol(trade.quoteLamports)}</td>
                                <td className="py-1.5 text-accent-2">+{sol(trade.feeLamports, 6)}</td>
                                <td className="py-1.5 font-mono text-xs">
                                    <a className="hover:underline" href={explorer('tx', trade.signature)} target="_blank" rel="noreferrer">
                                        {short(trade.trader)}
                                    </a>
                                </td>
                                <td className="py-1.5 text-right text-muted">{ago(trade.time)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Panel>
    )
}
