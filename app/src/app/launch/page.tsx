'use client'

import { useState } from 'react'
import { FormatPicker } from '@/components/launch/FormatPicker'
import { type Draft, suggestedDraft, TargetStep } from '@/components/launch/TargetStep'
import { useLaunch } from '@/components/launch/useLaunch'
import { Panel } from '@/components/ui'
import type { KnownFormat } from '@/lib/known'
import { type LaunchRequest, statementProblem } from '@/lib/launch'

const FACTS: [string, string][] = [
    ['Fees', 'Every trade pays 1%. Everything the protocol leaves goes to the problem’s bounty, before and after graduation.'],
    ['Graduation', 'When the curve fills, the pool migrates to Meteora DAMM v2 and the problem keeps a permanently locked position whose fees also fund the bounty.'],
    ['Who decides', 'The first scheme the toll program verifies at or below the target takes the bounty. No committee.'],
    ['Cost', 'Account rent for the token, pool, metadata, problem and vaults: a few hundredths of a SOL, paid once by the launcher.'],
]

export default function Launch() {
    const [format, setFormat] = useState<KnownFormat | null>(null)
    const [draft, setDraft] = useState<Draft | null>(null)
    const { publicKey, busy, note, launch } = useLaunch()

    const request: LaunchRequest | null = format && draft ? { n: format.n, target: Number(draft.target), name: draft.name, symbol: draft.symbol } : null
    const problem = request ? statementProblem(request) : 'Pick a format first.'
    const pick = (next: KnownFormat) => {
        setFormat(next)
        setDraft(suggestedDraft(next))
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Launch a problem</h1>
                <p className="mt-1 text-muted">
                    Turn an open matrix multiplication problem into a token on a Meteora bonding curve. Trading funds the bounty; the toll program pays whoever
                    first submits a scheme that verifies.
                </p>
            </div>
            <Panel className="p-5">
                <FormatPicker value={format} onChange={pick} />
            </Panel>
            {format && draft && (
                <Panel className="p-5">
                    <TargetStep format={format} draft={draft} onChange={setDraft} />
                </Panel>
            )}
            {format && draft && (
                <Panel className="space-y-4 p-5">
                    <h2 className="font-medium">3. Review and launch</h2>
                    <p className="font-mono text-lg">
                        ⟨{format.n.join('×')} : ≤{draft.target || '?'}⟩ <span className="text-sm text-muted">{draft.symbol}</span>
                    </p>
                    <dl className="grid gap-2 text-sm">
                        {FACTS.map(([term, text]) => (
                            <div key={term} className="grid grid-cols-[6.5rem_1fr] gap-2">
                                <dt className="text-muted">{term}</dt>
                                <dd>{text}</dd>
                            </div>
                        ))}
                    </dl>
                    {problem && <p className="text-sm text-warn">{problem}</p>}
                    <p className="min-h-5 text-sm text-accent-2" aria-live="polite">
                        {note}
                    </p>
                    <button
                        onClick={() => request && launch(request)}
                        disabled={busy || (!!publicKey && !!problem)}
                        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg disabled:opacity-40"
                    >
                        {!publicKey ? 'Connect wallet' : busy ? 'Launching…' : 'Launch'}
                    </button>
                </Panel>
            )}
        </div>
    )
}
