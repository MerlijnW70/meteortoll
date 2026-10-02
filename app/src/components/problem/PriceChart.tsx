'use client'

import { useEffect, useRef } from 'react'
import type { ProblemView } from '@/lib/chain'
import { useTrades } from '@/hooks/useMarket'
import { type Trade, solPerToken } from '@/lib/trades'
import { useTheme } from '../ThemeSwitch'
import { Panel, Skeleton } from '../ui'

const SUPPLY = 1_000_000_000

interface Point {
    time: number
    value: number
}

function points(trades: Trade[]): Point[] {
    const bySecond = new Map<number, number>()
    for (const trade of [...trades].reverse()) {
        if (trade.time) bySecond.set(trade.time, solPerToken(trade.sqrtPrice) * SUPPLY)
    }
    return [...bySecond.entries()].sort(([a], [b]) => a - b).map(([time, value]) => ({ time, value }))
}

function cssVar(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function PriceChart({ problem }: { problem: ProblemView }) {
    const container = useRef<HTMLDivElement>(null)
    const { data, isLoading, error } = useTrades(problem.account.pool)
    const series = data ? points(data) : []
    const { theme } = useTheme()

    useEffect(() => {
        const element = container.current
        if (!element || series.length < 2) return
        let disposed = false
        let cleanup = () => {}
        import('lightweight-charts').then(({ createChart, AreaSeries, ColorType }) => {
            if (disposed) return
            const chart = createChart(element, {
                autoSize: true,
                layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar('--muted'), fontSize: 11 },
                grid: { vertLines: { color: cssVar('--border') }, horzLines: { color: cssVar('--border') } },
                rightPriceScale: { borderColor: cssVar('--border') },
                timeScale: { borderColor: cssVar('--border'), timeVisible: true },
                crosshair: { horzLine: { labelBackgroundColor: cssVar('--panel-2') }, vertLine: { labelBackgroundColor: cssVar('--panel-2') } },
            })
            const area = chart.addSeries(AreaSeries, {
                lineColor: cssVar('--accent'),
                topColor: `${cssVar('--accent')}55`,
                bottomColor: `${cssVar('--accent')}05`,
                lineWidth: 2,
                priceFormat: { type: 'custom', formatter: (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} SOL` },
            })
            area.setData(series.map((p) => ({ time: p.time as never, value: p.value })))
            chart.timeScale().fitContent()
            cleanup = () => chart.remove()
        })
        return () => {
            disposed = true
            cleanup()
        }
    }, [series.length, series.at(-1)?.time, series.at(-1)?.value, theme]) // eslint-disable-line react-hooks/exhaustive-deps

    const latest = series.at(-1)?.value
    return (
        <Panel className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-medium">Market cap</h2>
                <span className="num text-sm text-muted">{latest !== undefined ? `${latest.toLocaleString('en-US', { maximumFractionDigits: 3 })} SOL` : ''}</span>
            </div>
            {isLoading && <Skeleton className="h-56" />}
            {error && <p className="text-sm text-bad">The price history could not be loaded.</p>}
            {data && series.length < 2 && (
                <p className="py-2 text-sm text-faint">The chart appears after the first two trades.</p>
            )}
            {series.length >= 2 && <div ref={container} className="h-56" role="img" aria-label={`Market cap after each of the last ${series.length} trades`} />}
        </Panel>
    )
}
