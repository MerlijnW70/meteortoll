import type { ProblemView } from './chain'
import { problemStanding } from './classify'

export type ChipTone = 'good' | 'accent' | 'warn' | 'muted'

export interface Chip {
    label: string
    tone: ChipTone
    live: boolean
}

export function cardChip(problem: Pick<ProblemView, 'phase' | 'account' | 'info'>, mainnet: boolean): Chip {
    if (problem.phase === 'solved') return { label: 'Solved', tone: 'good', live: true }
    if (problem.phase === 'grace') return { label: 'Checking an answer', tone: 'accent', live: true }
    const standing = problemStanding(problem, mainnet)
    if (standing === 'answered' || standing === 'impossible') return { label: 'Not winnable', tone: 'warn', live: false }
    if (standing === 'unreviewed') return { label: 'Not reviewed', tone: 'warn', live: false }
    return { label: 'Live', tone: 'good', live: true }
}

export function cardHues({ n1, n2, n3, targetRank }: Pick<ProblemView['account'], 'n1' | 'n2' | 'n3' | 'targetRank'>): [number, number] {
    const h = (n1 * 47 + n2 * 89 + n3 * 131 + targetRank * 7) % 360
    return [h, (h + 70) % 360]
}

export const cardTitle = ({ n1, n2, n3 }: Pick<ProblemView['account'], 'n1' | 'n2' | 'n3'>) => `${n1}×${n2} times ${n2}×${n3}`

export interface Look {
    a: number
    b: number
    seed: number
}

export function randomLook(random: () => number = Math.random): Look {
    const a = Math.floor(random() * 360)
    return { a, b: (a + 90 + Math.floor(random() * 90)) % 360, seed: Math.floor(random() * 1000) }
}

export const rowLight = (row: number, seed: number) => 46 + ((row * 37 + seed) % 22)
export const colLight = (col: number, seed: number) => 46 + ((col * 53 + seed * 7) % 22)

export function mixHue(a: number, b: number, t: number): number {
    const d = ((((b - a) % 360) + 540) % 360) - 180
    return (((a + d * t) % 360) + 360) % 360
}
