'use client'

import { useMemo, useState } from 'react'
import { KNOWN_FORMATS, type KnownFormat } from '@/lib/known'

const label = (n: number[]) => n.join('×')
const teamMeets = (f: KnownFormat) => !!f.team && f.team.rank < f.bestKnown.rank

/// A searchable radio group of formats with a published record.
export function FormatPicker({ value, onChange }: { value: KnownFormat | null; onChange: (format: KnownFormat) => void }) {
    const [query, setQuery] = useState('')
    const shown = useMemo(() => {
        const digits = query.match(/\d+/g)?.map(Number) ?? []
        // Formats the team's tool could already answer at best − 1 go last: launching one makes a disclosed demo.
        return KNOWN_FORMATS.filter((f) => digits.every((d) => f.n.includes(d))).sort((x, y) => Number(teamMeets(x)) - Number(teamMeets(y)))
    }, [query])
    return (
        <fieldset className="space-y-3">
            <legend className="mb-1 font-medium">1. Pick a format</legend>
            <p className="text-sm text-muted">Formats with a published best-known rank. The record and its date are shown on the problem page.</p>
            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter, e.g. 7 9"
                aria-label="Filter formats by dimension"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div role="radiogroup" aria-label="Formats" className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {shown.map((format) => {
                    const selected = value === format
                    const name = label(format.n)
                    const teamRecord = teamMeets(format)
                    return (
                        <label
                            key={name}
                            className={`cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:border-accent ${selected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}`}
                        >
                            <input type="radio" name="format" value={name} checked={selected} onChange={() => onChange(format)} className="sr-only" />
                            <span className="block font-mono">{name}</span>
                            <span className="num mt-1 block text-xs text-muted">
                                best {format.bestKnown.rank} · schoolbook {format.naive}
                            </span>
                            {teamRecord && <span className="mt-1 block text-xs text-warn">team holds {format.team!.rank} · disclosed demo</span>}
                        </label>
                    )
                })}
                {shown.length === 0 && <p className="col-span-full py-6 text-center text-sm text-faint">No known format matches.</p>}
            </div>
        </fieldset>
    )
}
