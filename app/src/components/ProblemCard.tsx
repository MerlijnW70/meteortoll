import Link from 'next/link'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { cardChip, cardHues, cardTitle, type ChipTone } from '@/lib/card'
import { CLUSTER } from '@/lib/config'
import { QuickBuy } from './QuickBuy'
import { sol } from './ui'

const CHIP_TONE: Record<ChipTone, string> = { good: 'bg-good', accent: 'bg-accent-2', warn: 'bg-warn', muted: 'bg-muted' }

function Matrices({ problem, saturation }: { problem: ProblemView; saturation: number }) {
    const { n1, n2, n3 } = problem.account
    const [a, b] = cardHues(problem.account)
    const cell = 9
    const gap = 3
    const unit = cell + gap
    const sign = 30
    const frame = { width: 380, height: 200 }
    const height = Math.max(n1, n2) * unit - gap
    const width = (n2 + n3) * unit - 2 * gap + sign
    const k = Math.min((frame.width * 0.86) / width, (frame.height * 0.86) / height, 2.2)
    const grid = (rows: number, cols: number, x0: number, hue: number, seed: number) => {
        const y0 = (height - (rows * unit - gap)) / 2
        return Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols)
            const c = i % cols
            const light = 48 + (((r * 7 + c * 13 + seed) * 37) % 24)
            return <rect key={`${seed}-${i}`} x={x0 + c * unit} y={y0 + r * unit} width={cell} height={cell} rx={2.5} fill={`hsl(${hue} ${saturation}% ${light}%)`} />
        })
    }
    const bx = n2 * unit - gap + sign
    return (
        <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="block h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" aria-hidden>
            <g transform={`translate(${(frame.width - width * k) / 2} ${(frame.height - height * k) / 2}) scale(${k})`}>
                {grid(n1, n2, 0, a, 1)}
                <text x={bx - sign / 2} y={height / 2} dy="0.35em" textAnchor="middle" fontSize={18} className="fill-muted">
                    ×
                </text>
                {grid(n2, n3, bx, b, 5)}
            </g>
        </svg>
    )
}

export function ProblemCard({ problem }: { problem: ProblemView }) {
    const [hue] = cardHues(problem.account)
    const chip = cardChip(problem, CLUSTER === 'mainnet')
    const solved = problem.phase === 'solved'
    return (
        <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-panel transition hover:border-accent/50 focus-within:border-accent">
            <Link
                href={`/p/${problem.address}`}
                className="flex flex-col p-2.5 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
                <span className="relative flex aspect-[16/10] items-center justify-center rounded-xl px-3 pb-2 pt-9" style={{ background: `hsl(${hue} var(--art-s) var(--art-l))` }}>
                    <Matrices problem={problem} saturation={solved ? 55 : 75} />
                    {chip && (
                        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-bg/80 px-2.5 py-1 text-xs text-text">
                            <span className={`h-2 w-2 rounded-full ${CHIP_TONE[chip.tone]}`} />
                            {chip.label}
                        </span>
                    )}
                    {problem.info.kind === 'demo' && <span className="absolute right-3 top-3 rounded-full bg-bg/60 px-2.5 py-1 text-xs text-muted">Demo</span>}
                </span>
                <span className="px-3.5 pt-4 text-2xl font-semibold tracking-tight">
                    {cardTitle(problem.account)}
                </span>
            </Link>
            <div className="pointer-events-none relative z-10 mt-auto flex items-center justify-between gap-4 px-6 pb-6 pt-3">
                <div>
                    <div className="num text-2xl font-semibold tracking-tight">
                        {sol(totalBounty(problem), 3)} <span className="text-base font-medium text-muted">SOL</span>
                    </div>
                    <div className="text-xs text-muted">{solved ? 'prize left' : 'prize'}</div>
                </div>
                <span className="pointer-events-auto">
                    {problem.graduated ? (
                        <Link href={`/p/${problem.address}`} className="text-sm text-accent hover:underline">
                            Trade ›
                        </Link>
                    ) : (
                        <QuickBuy problem={problem} className="num rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50" />
                    )}
                </span>
            </div>
        </article>
    )
}
