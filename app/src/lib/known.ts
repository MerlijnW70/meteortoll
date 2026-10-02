import known from '../../../problems/known.json'

export interface KnownFormat {
    n: [number, number, number]
    naive: number
    bestKnown: { rank: number; source: string; url: string; asOf: string; ring: string | null }
    team?: { rank: number; coefficients: string; tool: string }
}

export const KNOWN_FORMATS = (known as unknown as { formats: KnownFormat[] }).formats

const key = (n: number[]) => [...n].sort((a, b) => a - b).join('x')
const byShape = new Map(KNOWN_FORMATS.map((f) => [key(f.n), f]))

export function knownFormat(n1: number, n2: number, n3: number): KnownFormat | undefined {
    return byShape.get(key([n1, n2, n3]))
}

export interface RankBound {
    rank: number
    exact: boolean
    source: string
}

export function rankBound(n: readonly number[]): RankBound {
    const [a, b, c] = [...n].sort((x, y) => x - y)
    if (a === 1) return { rank: b * c, exact: true, source: 'one row or column needs every product' }
    if (a === 2 && b === 2 && c === 2) return { rank: 7, exact: true, source: 'Winograd 1971' }
    if (a === 2 && b === 2) return { rank: Math.ceil((7 * c) / 2), exact: true, source: 'Hopcroft and Kerr 1971' }
    return { rank: Math.max(a * b, b * c, c * a), exact: false, source: 'flattening bound' }
}

export type TargetStanding = 'open' | 'answered' | 'impossible'

export function targetStanding(n: readonly number[], target: number, best: number | undefined = knownFormat(n[0], n[1], n[2])?.bestKnown.rank): TargetStanding {
    const bound = rankBound(n)
    if (target < bound.rank) return 'impossible'
    if (bound.exact || (best !== undefined && target >= best)) return 'answered'
    return 'open'
}

export function targetProblem(n: readonly number[], target: number): string | null {
    const shape = n.join('×')
    const bound = rankBound(n)
    if (target < bound.rank) {
        return bound.exact
            ? `the rank of ${shape} is exactly ${bound.rank} (${bound.source}), so no scheme meets ${target}`
            : `no ${shape} scheme can use fewer than ${bound.rank} multiplications (${bound.source}), so no scheme meets ${target}`
    }
    if (bound.exact) return `the rank of ${shape} is exactly ${bound.rank} (${bound.source}): the problem is already answered`
    const best = knownFormat(n[0], n[1], n[2])?.bestKnown
    if (best && target >= best.rank) return `a rank-${best.rank} ${shape} scheme is already published (${best.source}): the target must be below ${best.rank}`
    return null
}
