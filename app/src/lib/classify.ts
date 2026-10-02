import type { ProblemView } from './chain'
import { rankBound, targetStanding } from './known'

export interface TeamRecord {
    rank: number
    coefficients: string
    tool: string
}

export interface Curation {
    kind: 'demo' | 'open'
    demoNote?: string
}

export interface Classification {
    kind: 'demo' | 'open'
    demoNote?: string
    teamMeetsTarget: boolean
}

export function classify(curated: Curation | undefined, team: TeamRecord | undefined, targetRank: number): Classification {
    const teamMeetsTarget = !!team && team.rank <= targetRank
    const kind = teamMeetsTarget ? 'demo' : (curated?.kind ?? 'open')
    const demoNote =
        curated?.demoNote ??
        (teamMeetsTarget
            ? `Disclosed demo: the meteortoll team's search tool (${team!.tool}) already holds a rank-${team!.rank} scheme for this format, which meets this target, so this is not a public bounty. If the team ever submits it, it will say so publicly.`
            : undefined)
    return { kind, demoNote: kind === 'demo' ? demoNote : undefined, teamMeetsTarget }
}

export type Standing = 'answered' | 'impossible' | 'unreviewed'

export interface StandingInput {
    n: readonly number[]
    target: number
    best?: number
    listed: boolean
    mainnet: boolean
}

export const STANDING_LABEL: Record<Standing, string> = { answered: 'Answered', impossible: 'Impossible', unreviewed: 'Unreviewed' }

export function standing({ n, target, best, listed, mainnet }: StandingInput): Standing | null {
    const found = targetStanding(n, target, best)
    if (found !== 'open') return found
    return mainnet && !listed ? 'unreviewed' : null
}

export function standingNote(kind: Standing, n: readonly number[], best?: number): string {
    const bound = rankBound(n)
    if (kind === 'impossible') return `No scheme can meet this target: the rank is at least ${bound.rank} (${bound.source}). Not a bounty anyone can win.`
    if (kind === 'answered') return bound.exact ? `Already answered: the rank is exactly ${bound.rank} (${bound.source}). Not an open problem.` : `Already answered: a rank-${best} scheme is published. Not an open problem.`
    return 'Unreviewed: launched by anyone and not checked by meteortoll.'
}

export function problemStanding({ account, info }: Pick<ProblemView, 'account' | 'info'>, mainnet: boolean): Standing | null {
    return standing({ n: [account.n1, account.n2, account.n3], target: account.targetRank, best: info.bestKnown?.rank, listed: info.listed, mainnet })
}
