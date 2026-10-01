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

/// Rank does not depend on the order of the dimensions, so any permutation of a known format matches.
export function knownFormat(n1: number, n2: number, n3: number): KnownFormat | undefined {
    return byShape.get(key([n1, n2, n3]))
}
