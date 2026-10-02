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
