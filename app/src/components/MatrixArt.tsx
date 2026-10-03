import type { ReactNode } from 'react'
import type { ProblemView } from '@/lib/chain'
import { cardHues } from '@/lib/card'

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

export function MatrixArt({ problem, className = '', children }: { problem: ProblemView; className?: string; children?: ReactNode }) {
    const [hue] = cardHues(problem.account)
    return (
        <span className={`relative flex items-center justify-center ${className}`} style={{ background: `hsl(${hue} var(--art-s) var(--art-l))` }}>
            <Matrices problem={problem} saturation={problem.phase === 'solved' ? 55 : 75} />
            {children}
        </span>
    )
}
