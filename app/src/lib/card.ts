import type { ProblemView } from './chain'
import { problemStanding } from './classify'

export type ChipTone = 'good' | 'accent' | 'warn' | 'muted'

export function cardChip(problem: Pick<ProblemView, 'phase' | 'account' | 'info'>, mainnet: boolean): { label: string; tone: ChipTone } | null {
    if (problem.phase === 'solved') return { label: 'Solved', tone: 'muted' }
    if (problem.phase === 'grace') return { label: 'Checking an answer', tone: 'accent' }
    const standing = problemStanding(problem, mainnet)
    if (standing === 'answered' || standing === 'impossible') return { label: 'Not winnable', tone: 'warn' }
    if (standing === 'unreviewed') return { label: 'Not reviewed', tone: 'warn' }
    return null
}

export function cardHues({ n1, n2, n3, targetRank }: Pick<ProblemView['account'], 'n1' | 'n2' | 'n3' | 'targetRank'>): [number, number] {
    const h = (n1 * 47 + n2 * 89 + n3 * 131 + targetRank * 7) % 360
    return [h, (h + 70) % 360]
}

export const cardTitle = ({ n1, n2, n3 }: Pick<ProblemView['account'], 'n1' | 'n2' | 'n3'>) => `${n1}×${n2} times ${n2}×${n3}`
