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
import { FIRST_BUY_CAP_SOL, FIRST_BUY_PRESETS, firstBuyProblem, parseSol, quoteFirstBuy } from '@/lib/firstBuy'
import type { KnownFormat } from '@/lib/known'
import { type LaunchRequest, statementProblem } from '@/lib/launch'
import { type Draft, draftFor, launchKind, tokenProblem } from '@/lib/launchDraft'

const STEPS = 4

function Step({
    n,
    title,
    state,
    optional,
    summary,
    onChange,
    children,
}: {
    n: number
    title: string
    state: 'current' | 'done' | 'locked'
    optional?: boolean
    summary?: ReactNode
    onChange?: () => void
    children?: ReactNode
}) {
    const mark =
        state === 'done' ? 'bg-good/15 text-good' : state === 'current' ? 'bg-accent text-bg' : 'border border-border text-faint'
    return (
        <Panel className={`p-5 ${state === 'locked' ? 'opacity-60' : ''}`} aria-label={`Step ${n} of ${STEPS}: ${title}`}>
            <div className="flex items-center gap-3">
                <span aria-hidden className={`num grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${mark}`}>
                    {state === 'done' ? '✓' : n}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                        Step {n} of {STEPS}
                        {optional && ' · optional'}
                    </p>
                    <h2 className="font-medium">{title}</h2>
                </div>
                {state === 'done' && onChange && (
                    <button type="button" onClick={onChange} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text">
                        Change
                    </button>
                )}
            </div>
            {state === 'done' && summary && <div className="mt-3 pl-10">{summary}</div>}
            {state === 'current' && <div className="mt-4">{children}</div>}
            {state === 'locked' && <p className="mt-1 pl-10 text-sm text-faint">Choose a problem first.</p>}
        </Panel>
    )
}

export default function Launch() {
    const [format, setFormat] = useState<KnownFormat | null>(null)
    const [draft, setDraft] = useState<Draft | null>(null)
    const { publicKey, busy, note, launch, launched, unfinished, finish } = useLaunch()
    const terms = useLaunchTerms()
    const problems = useProblems()

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
              : firstBuyProblem(firstBuy)
                ? `The first buy can be at most ${FIRST_BUY_CAP_SOL} SOL.`
                : quote && quote.curveShare >= 1
                  ? `That buy would complete the whole curve, which holds ${graduation} SOL; buy less.`
                  : null
    const presets = useMemo(
        () => FIRST_BUY_PRESETS.filter((amount) => amount === 0 || !config || !terms.data || quoteFirstBuy(config, parseSol(String(amount))!, terms.data.point).curveShare < 1),
        [config, terms.data]
    )
    const cost = useLaunchCost(problem || buyError ? null : request)

    const [choosing, setChoosing] = useState(false)
    const pick = (next: KnownFormat) => {
        setFormat(next)
        setChoosing(false)
        setDraft((current) => ({ ...draftFor(next), firstBuy: current?.firstBuy ?? '0' }))
    }

    if (launched) {
        return (
            <div className="mx-auto max-w-2xl">
                <LaunchedPanel launched={launched} statement={`⟨${launched.n.join('×')} : ≤${launched.target}⟩`} onAnother={() => window.location.reload()} />
            </div>
        )
    }

    const kind = format && draft ? launchKind(format, Number(draft.target)) : 'open'
    return (
        <div className="space-y-6">
            <PageIntro title="Launch a problem">Pick a problem, set the target, launch. One wallet approval.</PageIntro>
            {unfinished && (
                <Panel className="flex flex-wrap items-center justify-between gap-3 p-4" role="alert">
                    <p className="text-sm text-warn">
                        Your launch of ⟨{unfinished.n.join('×')} : ≤{unfinished.target}⟩ created its pool, but the problem is not registered yet. Finish it to open the bounty.
                    </p>
                    <button type="button" onClick={finish} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
                        {busy ? 'Registering…' : 'Finish registration'}
                    </button>
                </Panel>
            )}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-4">
                    <Step
                        n={1}
                        title="Choose a problem"
                        state={format && !choosing ? 'done' : 'current'}
                        onChange={() => setChoosing(true)}
                        summary={
                            format && (
                                <p>
                                    <span className="font-mono text-lg">{format.n.join('×')}</span>{' '}
                                    <span className="text-sm text-muted">· record {format.bestKnown.rank}</span>
                                </p>
                            )
                        }
                    >
                        <p className="mb-3 text-sm text-muted">Each is an open problem: multiply matrices of this shape with fewer multiplications than the record.</p>
                        <FormatPicker value={format} onChange={pick} live={liveTargets} />
                    </Step>
                    <Step n={2} title="Set the target" state={format && draft ? 'current' : 'locked'}>
                        {format && draft && <TargetStep format={format} draft={draft} onChange={setDraft} live={live.get(formatKey(format.n))} />}
                    </Step>
                    <Step n={3} title="Name the token" state={format && draft ? 'current' : 'locked'}>
                        {draft && <TokenStep draft={draft} onChange={setDraft} />}
                    </Step>
                    <Step n={4} title="First buy" optional state={format && draft ? 'current' : 'locked'}>
                        {draft && (
                            <FirstBuyStep presets={presets} value={draft.firstBuy} onChange={(amount) => setDraft({ ...draft, firstBuy: amount })} quote={quote} error={buyError} />
                        )}
                    </Step>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Launch summary">
                    <Preview format={format} target={draft?.target ?? ''} symbol={draft?.symbol ?? ''} kind={kind} quote={buyError ? null : quote} />
                    <Panel className="space-y-4 p-4">
                        {format && (
                            <Cost
                                connected={!!publicKey}
                                total={cost.data}
                                loading={cost.isFetching || (!!request && !problem && !buyError && !cost.data && !cost.error)}
                                error={cost.error ? cost.error.message : null}
                                firstBuy={firstBuy}
                            />
                        )}
                        {problem && format && draft && !tokenProblem(draft) && <p className="text-sm text-warn">{problem}</p>}
                        {terms.error && <p className="text-sm text-warn">{terms.error.message}</p>}
                        <p className="min-h-5 text-sm text-accent-2" aria-live="polite">
                            {note}
                        </p>
                        <button
                            onClick={() => launch(request)}
                            disabled={busy || !format || (!!publicKey && (!!problem || !!buyError))}
                            className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-bg disabled:opacity-40"
                        >
                            {!format
                                ? 'Choose a problem first'
                                : busy
                                  ? 'Launching…'
                                  : !publicKey
                                    ? 'Connect wallet to launch'
                                    : cost.data !== undefined
                                      ? `Launch · ${sol(cost.data, 4)} SOL`
                                      : 'Launch'}
                        </button>
                        <p className="text-xs text-faint">
                            {graduation && <>Graduates to Meteora DAMM v2 at {graduation} SOL. </>}
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
