'use client'

import type { KnownFormat } from '@/lib/known'
import { NAME_LIMIT, SYMBOL_LIMIT } from '@/lib/launch'

export interface Draft {
    target: string
    name: string
    symbol: string
}

export function suggestedDraft(format: KnownFormat): Draft {
    const [a, b, c] = format.n
    const target = format.bestKnown.rank - 1
    return { target: String(target), name: `${a}x${b}x${c} rank<=${target}`, symbol: `MM${a}${b}${c}`.slice(0, SYMBOL_LIMIT) }
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="text-sm">
                {label}
            </label>
            {children}
            {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
    )
}

const input = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent'

export function TargetStep({ format, draft, onChange }: { format: KnownFormat; draft: Draft; onChange: (draft: Draft) => void }) {
    const target = Number(draft.target)
    const best = format.bestKnown.rank
    const team = format.team
    return (
        <fieldset className="space-y-4">
            <legend className="mb-1 font-medium">2. Set the target and name</legend>
            <Field id="target" label="Target rank" hint={`Best known ${best} (${format.bestKnown.asOf}). A target of ${best - 1} asks for a new record.`}>
                <input id="target" inputMode="numeric" value={draft.target} onChange={(e) => onChange({ ...draft, target: e.target.value.replace(/\D/g, '') })} className={`num ${input}`} />
            </Field>
            {Number.isFinite(target) && target >= best && (
                <p role="alert" className="rounded-lg bg-warn/10 p-3 text-sm text-warn">
                    A scheme of rank {best} is already published, so anyone holding it could claim this bounty right away. Use {best - 1} or lower for an open
                    problem.
                </p>
            )}
            {team && target >= team.rank && target < best && (
                <p role="alert" className="rounded-lg bg-warn/10 p-3 text-sm text-warn">
                    The meteortoll team&apos;s search tool already holds a rank-{team.rank} scheme for this format, so a target of {team.rank} or more launches as a disclosed demo, not a public bounty. Use {team.rank - 1} or lower for a public bounty.
                </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="name" label="Token name" hint={`Up to ${NAME_LIMIT} characters.`}>
                    <input id="name" maxLength={NAME_LIMIT} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} className={input} />
                </Field>
                <Field id="symbol" label="Symbol" hint={`Up to ${SYMBOL_LIMIT} capital letters or digits.`}>
                    <input
                        id="symbol"
                        maxLength={SYMBOL_LIMIT}
                        value={draft.symbol}
                        onChange={(e) => onChange({ ...draft, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                        className={`font-mono ${input}`}
                    />
                </Field>
            </div>
        </fieldset>
    )
}
