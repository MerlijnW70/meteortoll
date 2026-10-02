'use client'

import { type ReactNode, useMemo, useState } from 'react'
import Link from 'next/link'
import { FirstBuyStep } from '@/components/launch/FirstBuyStep'
import { FormatPicker, formatKey } from '@/components/launch/FormatPicker'
import { Cost, LaunchedPanel, Preview } from '@/components/launch/LaunchSummary'
import { TargetStep, TokenStep } from '@/components/launch/TargetStep'
import { useLaunch } from '@/components/launch/useLaunch'
import { useLaunchCost, useLaunchTerms } from '@/components/launch/useLaunchTerms'
import { PageIntro, Panel, sol } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import { FIRST_BUY_PRESETS, parseSol, quoteFirstBuy } from '@/lib/firstBuy'
import type { KnownFormat } from '@/lib/known'
import { type LaunchRequest, statementProblem } from '@/lib/launch'
import { type Draft, draftFor, launchKind } from '@/lib/launchDraft'

function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <Panel className="p-5">
            <div className="mb-4 flex items-baseline gap-3">
                <span aria-hidden className="num grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {n}
                </span>
                <h2 className="font-medium">{title}</h2>
                {aside && <span className="ml-auto text-xs text-muted">{aside}</span>}
            </div>
            {children}
        </Panel>
    )
}

export default function Launch() {
    const [format, setFormat] = useState<KnownFormat | null>(null)
    const [draft, setDraft] = useState<Draft | null>(null)
    const { publicKey, busy, note, launch, launched } = useLaunch()
    const terms = useLaunchTerms()
    const problems = useProblems()

    // Open problems per format, so the picker can say which are already live.
    const live = useMemo(() => {
        const found = new Map<string, { address: string; target: number }>()
        for (const p of problems.data ?? []) {
            if (p.phase === 'solved') continue
            const { n1, n2, n3, targetRank } = p.account
            found.set(formatKey([n1, n2, n3]), { address: p.address, target: targetRank })
        }
        return found
    }, [problems.data])
    const liveTargets = useMemo(() => new Map([...live].map(([key, { target }]) => [key, target])), [live])

    const firstBuy = draft ? parseSol(draft.firstBuy) : null
    const request: LaunchRequest | null =
        format && draft && firstBuy ? { n: format.n, target: Number(draft.target), name: draft.name, symbol: draft.symbol, firstBuy } : null
    const problem = !format || !draft ? 'Pick a format first.' : !firstBuy ? 'The first buy needs an amount in SOL, such as 0.5.' : statementProblem(request!)

    const config = terms.data?.config
    const quote = useMemo(() => (config && terms.data && firstBuy?.gtn(0) ? quoteFirstBuy(config, firstBuy, terms.data.point) : null), [config, terms.data, firstBuy])
    const graduation = config ? sol(BigInt(config.migrationQuoteThreshold.toString()), 2) : null
    const buyError =
        !draft || draft.firstBuy === ''
            ? null
            : !firstBuy
              ? 'Type an amount in SOL, such as 0.5.'
              : quote && quote.curveShare >= 1
                ? `That buy would complete the whole curve, which holds ${graduation} SOL; buy less.`
                : null
    // Presets that would complete the curve are left out: a first buy should leave it open.
    const presets = useMemo(
        () => FIRST_BUY_PRESETS.filter((amount) => amount === 0 || !config || !terms.data || quoteFirstBuy(config, parseSol(String(amount))!, terms.data.point).curveShare < 1),
        [config, terms.data]
    )
    const cost = useLaunchCost(problem || buyError ? null : request)

    const pick = (next: KnownFormat) => {
        setFormat(next)
        setDraft((current) => ({ ...draftFor(next), firstBuy: current?.firstBuy ?? '0' }))
    }

    if (launched && format && draft) {
        return (
            <div className="mx-auto max-w-2xl">
                <LaunchedPanel
                    launched={launched}
                    statement={`⟨${format.n.join('×')} : ≤${draft.target}⟩`}
                    onAnother={() => window.location.reload()}
                />
            </div>
        )
    }

    const kind = format && draft ? launchKind(format, Number(draft.target)) : 'open'
    return (
        <div className="space-y-6">
            <PageIntro title="Launch a problem">
                Put an open matrix multiplication problem on a Meteora bonding curve. Trading fees fund its bounty, and the toll program pays the first scheme that verifies.
            </PageIntro>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-4">
                    <Step n={1} title="Problem" aside="formats with a published record">
                        <FormatPicker value={format} onChange={pick} live={liveTargets} />
                    </Step>
                    {format && draft && (
                        <>
                            <Step n={2} title="Target rank" aside="multiplications a winning scheme may use">
                                <TargetStep format={format} draft={draft} onChange={setDraft} live={live.get(formatKey(format.n))} />
                            </Step>
                            <Step n={3} title="Token">
                                <TokenStep draft={draft} onChange={setDraft} />
                            </Step>
                            <Step n={4} title="First buy" aside="optional">
                                <FirstBuyStep presets={presets} value={draft.firstBuy} onChange={(amount) => setDraft({ ...draft, firstBuy: amount })} quote={quote} error={buyError} />
                            </Step>
                        </>
                    )}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Launch summary">
                    <Preview format={format} target={draft?.target ?? ''} symbol={draft?.symbol ?? ''} kind={kind} quote={buyError ? null : quote} />
                    <Panel className="space-y-4 p-4">
                        <Cost
                            connected={!!publicKey}
                            total={cost.data}
                            loading={cost.isFetching || (!!request && !problem && !buyError && !cost.data && !cost.error)}
                            error={cost.error ? cost.error.message : null}
                            firstBuy={firstBuy}
                        />
                        {problem && format && <p className="text-sm text-warn">{problem}</p>}
                        <p className="min-h-5 text-sm text-accent-2" aria-live="polite">
                            {note}
                        </p>
                        <button
                            onClick={() => launch(request)}
                            disabled={busy || (!!publicKey && (!!problem || !!buyError))}
                            className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-medium text-bg disabled:opacity-40"
                        >
                            {!publicKey ? 'Connect wallet' : busy ? 'Launching…' : 'Launch'}
                        </button>
                        <p className="text-xs text-faint">
                            {graduation && <>When the curve holds {graduation} SOL it graduates to Meteora DAMM v2, and the problem keeps a locked position whose fees also fund the bounty. </>}
                            One wallet approval.{' '}
                            <Link href="/terms" className="underline hover:text-muted">
                                Terms and risks
                            </Link>
                        </p>
                    </Panel>
                </aside>
            </div>
        </div>
    )
}
