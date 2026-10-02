'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type KnownFormat, rankBound } from '@/lib/known'
import { NAME_LIMIT, SYMBOL_LIMIT } from '@/lib/launch'
import { type Draft, targetNote, tokenProblem, withTarget } from '@/lib/launchDraft'

const input = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent'
const stepButton = 'grid size-10 place-items-center rounded-lg border border-border text-lg text-muted hover:border-accent/50 hover:text-text disabled:opacity-40'

export function TargetStep({ format, draft, onChange, live }: { format: KnownFormat; draft: Draft; onChange: (draft: Draft) => void; live?: { address: string; target: number } }) {
    const target = Number(draft.target)
    const note = draft.target === '' ? null : targetNote(format, target)
    const set = (next: number | string) => onChange(withTarget(format, draft, String(next)))
    const record = format.bestKnown
    const floor = rankBound(format.n).rank
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button type="button" aria-label="Lower the target" className={stepButton} disabled={!(target > floor)} onClick={() => set(target - 1)}>
                    −
                </button>
                <input
                    id="target"
                    aria-label="Target rank"
                    inputMode="numeric"
                    value={draft.target}
                    onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
                    className="num h-10 w-24 rounded-lg border border-border bg-bg text-center font-mono text-lg outline-none focus:border-accent"
                />
                <button type="button" aria-label="Raise the target" className={stepButton} disabled={!(target < format.naive - 1)} onClick={() => set(target + 1)}>
                    +
                </button>
                <p className="ml-2 text-xs text-muted">
                    Record <span className="num text-text">{record.rank}</span>{' '}
                    <a href={record.url} target="_blank" rel="noreferrer" className="underline hover:text-text">
                        ({record.asOf})
                    </a>
                    <br />
                    Schoolbook <span className="num text-text">{format.naive}</span> · floor <span className="num text-text">{floor}</span>
                </p>
            </div>
            {note && (
                <p role={note.tone === 'warn' ? 'alert' : undefined} className={`rounded-lg p-3 text-sm ${note.tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-accent-2/10 text-accent-2'}`}>
                    {note.text}
                </p>
            )}
            {live && (
                <p className="rounded-lg bg-panel-2 p-3 text-sm text-muted">
                    This format is already live at ≤{live.target}.{' '}
                    <Link href={`/p/${live.address}`} className="text-text underline">
                        Open that problem
                    </Link>{' '}
                    — a second launch splits traders between two bounties.
                </p>
            )}
        </div>
    )
}

export function TokenStep({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
    const [editing, setEditing] = useState(false)
    const problem = tokenProblem(draft)
    if (!editing && !problem) {
        return (
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0">
                    <span className="block truncate">
                        <span className="font-mono font-medium">{draft.symbol}</span> <span className="text-muted">· {draft.name}</span>
                    </span>
                    <span className="block text-xs text-faint">{draft.named ? 'Your name and symbol.' : 'Filled in from the problem.'}</span>
                </p>
                <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text">
                    Edit
                </button>
            </div>
        )
    }
    return (
        <form
            className="grid gap-4 sm:grid-cols-[1fr_10rem]"
            onSubmit={(event) => {
                event.preventDefault()
                if (!problem) setEditing(false)
            }}
        >
            <div className="space-y-1">
                <label htmlFor="name" className="text-sm">
                    Name
                </label>
                <input
                    id="name"
                    autoFocus
                    maxLength={NAME_LIMIT}
                    value={draft.name}
                    onChange={(e) => onChange({ ...draft, name: e.target.value, named: true })}
                    aria-invalid={!!problem && /name/.test(problem)}
                    className={input}
                />
            </div>
            <div className="space-y-1">
                <label htmlFor="symbol" className="text-sm">
                    Symbol
                </label>
                <input
                    id="symbol"
                    maxLength={SYMBOL_LIMIT}
                    value={draft.symbol}
                    onChange={(e) => onChange({ ...draft, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), named: true })}
                    aria-invalid={!!problem && /symbol/.test(problem)}
                    className={`font-mono ${input}`}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <p role={problem ? 'alert' : undefined} className={`text-xs ${problem ? 'text-warn' : 'text-muted'}`}>
                    {problem ?? `Name: up to ${NAME_LIMIT} characters, fewer with accents. Symbol: up to ${SYMBOL_LIMIT} capitals or digits.`}
                </p>
                <button type="submit" disabled={!!problem} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-bg disabled:opacity-40">
                    Done
                </button>
            </div>
        </form>
    )
}
