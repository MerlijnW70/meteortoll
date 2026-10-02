'use client'

import { useMemo, useState } from 'react'
import { KNOWN_FORMATS, type KnownFormat } from '@/lib/known'
import { ShowAll } from '../ui'

const FIRST = 6

const label = (n: number[]) => n.join('×')
export const formatKey = (n: number[]) => [...n].sort((a, b) => a - b).join('x')
const teamMeets = (f: KnownFormat) => !!f.team && f.team.rank < f.bestKnown.rank

export function FormatPicker({ value, onChange, live }: { value: KnownFormat | null; onChange: (format: KnownFormat) => void; live: Map<string, number> }) {
    const [query, setQuery] = useState('')
    const [all, setAll] = useState(false)
    const shown = useMemo(() => {
        const digits = query.match(/\d+/g)?.map(Number) ?? []
        const later = (f: KnownFormat) => Number(live.has(formatKey(f.n))) * 2 + Number(teamMeets(f))
        return KNOWN_FORMATS.filter((f) => digits.every((d) => f.n.includes(d))).sort((x, y) => later(x) - later(y))
    }, [query, live])
    return (
        <div className="space-y-3">
            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a size, e.g. 7 9"
                aria-label="Filter formats by dimension"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div role="radiogroup" aria-label="Formats" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(all || query ? shown : shown.slice(0, FIRST)).map((format) => {
                    const selected = value === format
                    const name = label(format.n)
                    const liveTarget = live.get(formatKey(format.n))
                    return (
                        <label
                            key={name}
                            className={`cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:border-accent ${selected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}`}
                        >
                            <input type="radio" name="format" value={name} checked={selected} onChange={() => onChange(format)} className="sr-only" />
                            <span className="block font-mono text-lg">{name}</span>
                            <span className="num mt-1 block text-xs text-muted">Beat {format.bestKnown.rank}</span>
                            {liveTarget !== undefined ? (
                                <span className="mt-1 block text-xs text-accent-2">live at ≤{liveTarget}</span>
                            ) : (
                                teamMeets(format) && <span className="mt-1 block text-xs text-warn">team holds {format.team!.rank} · demo</span>
                            )}
                        </label>
                    )
                })}
                {shown.length === 0 && <p className="col-span-full py-6 text-center text-sm text-faint">No known format matches.</p>}
            </div>
            {!query && shown.length > FIRST && <ShowAll open={all} total={shown.length} noun="formats" onToggle={() => setAll(!all)} />}
        </div>
    )
}
