'use client'

import { type ReactNode, useState } from 'react'
import type { ProblemView } from '@/lib/chain'
import { cardHues, colLight, mixHue, randomLook, rowLight } from '@/lib/card'

export const DRAWN = 24
export const drawn = ({ n1, n2, n3 }: Pick<ProblemView['account'], 'n1' | 'n2' | 'n3'>) => ({ n1: Math.min(n1, DRAWN), n2: Math.min(n2, DRAWN), n3: Math.min(n3, DRAWN) })

function Matrices({ problem, saturation }: { problem: ProblemView; saturation: number }) {
    const { n1, n2, n3 } = drawn(problem.account)
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

export function ProductArt({ problem, className = '', children }: { problem: ProblemView; className?: string; children?: ReactNode }) {
    const [look] = useState(() => randomLook())
    const { n1, n2, n3 } = drawn(problem.account)
    const { a, b, seed } = look
    const saturation = problem.phase === 'solved' ? 55 : 75
    const cell = 9
    const gap = 3
    const unit = cell + gap
    const sign = 26
    const frame = { width: 520, height: 220 }
    const height = Math.max(n1, n2) * unit - gap
    const width = (n2 + 2 * n3) * unit - 3 * gap + 2 * sign
    const k = Math.min((frame.width * 0.9) / width, (frame.height * 0.86) / height, 2.4)
    const top = (rows: number) => (height - (rows * unit - gap)) / 2
    const fill = (hue: number, light: number) => `hsl(${hue} ${saturation}% ${light}%)`
    const bx = n2 * unit - gap + sign
    const cx = bx + n3 * unit - gap + sign
    const cells = n1 * n3
    const step = Math.min(18, 1100 / cells)
    return (
        <span className={`relative flex items-center justify-center ${className}`} style={{ background: `hsl(${a} var(--art-s) var(--art-l))` }}>
            <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="block h-full w-full" aria-hidden>
                <g transform={`translate(${(frame.width - width * k) / 2} ${(frame.height - height * k) / 2}) scale(${k})`}>
                    {Array.from({ length: n1 * n2 }, (_, i) => {
                        const r = Math.floor(i / n2)
                        const c = i % n2
                        return <rect key={`a${i}`} x={c * unit} y={top(n1) + r * unit} width={cell} height={cell} rx={2.5} fill={fill(a, rowLight(r, seed) + ((c * 13 + seed) % 5))} />
                    })}
                    <text x={bx - sign / 2} y={height / 2} dy="0.35em" textAnchor="middle" fontSize={16} className="fill-muted">
                        ×
                    </text>
                    {Array.from({ length: n2 * n3 }, (_, i) => {
                        const r = Math.floor(i / n3)
                        const c = i % n3
                        return <rect key={`b${i}`} x={bx + c * unit} y={top(n2) + r * unit} width={cell} height={cell} rx={2.5} fill={fill(b, colLight(c, seed) + ((r * 11 + seed) % 5))} />
                    })}
                    <text x={cx - sign / 2} y={height / 2} dy="0.35em" textAnchor="middle" fontSize={16} className="fill-muted">
                        =
                    </text>
                    {Array.from({ length: cells }, (_, i) => {
                        const r = Math.floor(i / n3)
                        const c = i % n3
                        const hue = mixHue(a, b, 0.3 + (0.4 * c) / Math.max(1, n3 - 1))
                        return (
                            <rect
                                key={`c${i}`}
                                x={cx + c * unit}
                                y={top(n1) + r * unit}
                                width={cell}
                                height={cell}
                                rx={2.5}
                                fill={fill(hue, (rowLight(r, seed) + colLight(c, seed)) / 2)}
                                className="art-pop"
                                style={{ animationDelay: `${Math.round(i * step)}ms` }}
                            />
                        )
                    })}
                </g>
            </svg>
            {children}
        </span>
    )
}
