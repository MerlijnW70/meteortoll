import type { ComponentProps, ReactNode } from 'react'
import type { ProblemView } from '@/lib/chain'

export function sol(lamports: bigint, digits = 4): string {
    const whole = Number(lamports) / 1e9
    if (whole === 0) return '0'
    if (whole < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}`
    return whole.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function Skeleton({ className = '' }: { className?: string }) {
    return <div aria-hidden className={`skeleton ${className}`} />
}

export function Panel({ children, className = '', ...rest }: ComponentProps<'section'>) {
    return (
        <section {...rest} className={`rounded-xl border border-border bg-panel ${className}`}>
            {children}
        </section>
    )
}

const badgeStyles: Record<string, string> = {
    open: 'bg-accent/15 text-accent border-accent/30',
    demo: 'bg-warn/15 text-warn border-warn/30',
    grace: 'bg-accent-2/15 text-accent-2 border-accent-2/30',
    solved: 'bg-good/15 text-good border-good/30',
}

export function StatusBadge({ problem }: { problem: ProblemView }) {
    const items: [string, string][] = []
    if (problem.info.kind === 'demo') items.push(['demo', 'Disclosed demo'])
    if (problem.phase === 'open') items.push(['open', 'Open'])
    if (problem.phase === 'grace') items.push(['grace', 'Verified · in grace window'])
    if (problem.phase === 'solved') items.push(['solved', 'Solved · verified on-chain'])
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map(([style, label]) => (
                <span key={label} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeStyles[style]}`}>
                    {label}
                </span>
            ))}
        </div>
    )
}

export function Meter({ label, value, detail, tone = 'accent' }: { label: string; value: number; detail: ReactNode; tone?: 'accent' | 'good' }) {
    const percent = Math.round(value * 1000) / 10
    return (
        <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="text-muted">{label}</span>
                <span className="num text-text">{detail}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                <div className={`h-full rounded-full ${tone === 'good' ? 'bg-good' : 'bg-accent'} transition-[width] duration-700`} style={{ width: `${percent}%` }} />
            </div>
        </div>
    )
}

export function shape(problem: ProblemView) {
    const { n1, n2, n3, targetRank } = problem.account
    return { label: `${n1}×${n2}×${n3}`, target: targetRank, naive: n1 * n2 * n3 }
}

export function short(address: string): string {
    return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export function PageIntro({ title, children }: { title: ReactNode; children?: ReactNode }) {
    return (
        <div className="space-y-2">
            <h1 className="text-3xl font-semibold">{title}</h1>
            {children && <div className="max-w-2xl text-lg text-muted">{children}</div>}
        </div>
    )
}

export function More({ label = 'More', less = 'Less', children, className = '' }: { label?: string; less?: string; children: ReactNode; className?: string }) {
    return (
        <details className={`group ${className}`}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-accent hover:underline [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">{label}</span>
                <span className="hidden group-open:inline">{less}</span>
                <span aria-hidden className="text-xs transition-transform group-open:rotate-180">
                    ▾
                </span>
            </summary>
            <div className="mt-3">{children}</div>
        </details>
    )
}

export function ShowAll({ open, total, noun, onToggle }: { open: boolean; total: number; noun?: string; onToggle: () => void }) {
    return (
        <button onClick={onToggle} aria-expanded={open} className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
            {open ? 'Less' : `All ${total}${noun ? ` ${noun}` : ''}`}
            <span aria-hidden className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
                ▾
            </span>
        </button>
    )
}
