// What the launch form holds and what it says about it, kept apart from the page so it can be
// tested: the token's default name, how a target reads against the record, and whether a launch
// is an open bounty or a disclosed demo.

import type { KnownFormat } from './known'
import { SYMBOL_LIMIT } from './launch'

export interface Draft {
    target: string
    name: string
    symbol: string
    /// Whether the launcher typed their own name and symbol; until then both follow the target.
    named: boolean
    /// The first buy in SOL, as typed.
    firstBuy: string
}

export const tokenName = (n: number[], target: number | string) => `${n.join('x')} rank<=${target}`
export const tokenSymbol = (n: number[]) => `MM${n.join('')}`.slice(0, SYMBOL_LIMIT)

/// A fresh draft for a format: one below the record, the default token, no first buy.
export function draftFor(format: KnownFormat): Draft {
    const target = String(format.bestKnown.rank - 1)
    return { target, name: tokenName(format.n, target), symbol: tokenSymbol(format.n), named: false, firstBuy: '0' }
}

/// A new target, carrying the default name along unless the launcher named the token.
export function withTarget(format: KnownFormat, draft: Draft, target: string): Draft {
    return draft.named ? { ...draft, target } : { ...draft, target, name: tokenName(format.n, target) }
}

/// A team-held format launched at or above the team's rank is a disclosed demo: the team could
/// claim it at once.
export function launchKind(format: KnownFormat, target: number): 'open' | 'demo' {
    return format.team && target >= format.team.rank ? 'demo' : 'open'
}

export interface TargetNote {
    tone: 'good' | 'warn'
    text: string
}

/// How a target reads against the published record and the team's own result.
export function targetNote(format: KnownFormat, target: number): TargetNote | null {
    const best = format.bestKnown.rank
    if (!Number.isInteger(target) || target < 1 || target >= format.naive) return null
    if (target >= best) {
        return { tone: 'warn', text: `A rank-${best} scheme is already published, so anyone holding it could claim this bounty at once. Use ${best - 1} or lower for an open problem.` }
    }
    if (launchKind(format, target) === 'demo') {
        return {
            tone: 'warn',
            text: `The meteortoll team already holds a rank-${format.team!.rank} scheme for this format, so this launches as a disclosed demo, not a public bounty. Use ${format.team!.rank - 1} or lower for a public bounty.`,
        }
    }
    if (target === best - 1) return { tone: 'good', text: 'One below the record: the scheme that takes this bounty is a new record.' }
    return { tone: 'good', text: `${best - target} below the record: a harder problem than a new record alone.` }
}
