import { type KnownFormat, rankBound, targetStanding } from './known'
import { NAME_LIMIT, SYMBOL_LIMIT } from './launch'

export interface Draft {
    target: string
    name: string
    symbol: string
    named: boolean
    firstBuy: string
}

export const tokenName = (n: number[], target: number | string) => `${n.join('x')} rank<=${target}`
export const tokenSymbol = (n: number[]) => `MM${n.join('')}`.slice(0, SYMBOL_LIMIT)

export function draftFor(format: KnownFormat): Draft {
    const target = String(format.bestKnown.rank - 1)
    return { target, name: tokenName(format.n, target), symbol: tokenSymbol(format.n), named: false, firstBuy: '0' }
}

export function withTarget(format: KnownFormat, draft: Draft, target: string): Draft {
    return draft.named ? { ...draft, target } : { ...draft, target, name: tokenName(format.n, target) }
}

export type LaunchKind = 'open' | 'demo' | 'answered' | 'impossible'

export function launchKind(format: KnownFormat, target: number): LaunchKind {
    const standing = targetStanding(format.n, target, format.bestKnown.rank)
    if (standing !== 'open') return standing
    return format.team && target >= format.team.rank ? 'demo' : 'open'
}

export interface TargetNote {
    tone: 'good' | 'warn'
    text: string
}

export function targetNote(format: KnownFormat, target: number): TargetNote | null {
    const best = format.bestKnown.rank
    if (!Number.isInteger(target) || target < 1 || target >= format.naive) return null
    const bound = rankBound(format.n)
    if (target < bound.rank) {
        return { tone: 'warn', text: `No scheme can meet ${target}: this format needs at least ${bound.rank} multiplications (${bound.source}). Use ${bound.rank} to ${best - 1}.` }
    }
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

export function tokenProblem({ name, symbol }: Pick<Draft, 'name' | 'symbol'>): string | null {
    if (!name.trim()) return 'The name cannot be empty.'
    if (new TextEncoder().encode(name).length > NAME_LIMIT) return `The name can have at most ${NAME_LIMIT} bytes.`
    if (!symbol) return 'The symbol cannot be empty.'
    if (!/^[A-Z0-9]+$/.test(symbol) || symbol.length > SYMBOL_LIMIT) return `The symbol needs 1 to ${SYMBOL_LIMIT} capital letters or digits.`
    return null
}
