'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ErrorPanel } from '@/components/ErrorPanel'
import { AttemptRow } from '@/components/me/AttemptRow'
import { ClaimPanel } from '@/components/problem/ClaimPanel'
import { QuickBuy } from '@/components/QuickBuy'
import { MatrixArt } from '@/components/MatrixArt'
import { BUTTON, More, PageIntro, Panel, shape, short, Skeleton, sol } from '@/components/ui'
import { cardTitle } from '@/lib/card'
import { useProblems } from '@/hooks/useProblems'
import { type Activity, bountyFunded, costBasis, fetchActivity } from '@/lib/activity'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { explorer } from '@/lib/config'
import { ago, percentDown, tokens } from '@/lib/format'
import { fetchPortfolio, type Position } from '@/lib/portfolio'

const statement = (p: ProblemView) => `⟨${shape(p).label} : ≤${p.account.targetRank}⟩`
const lamportsOf = (valueSol: number) => BigInt(Math.round(valueSol * 1e9))

function Pnl({ lamports, base }: { lamports: bigint; base?: bigint }) {
    const tone = lamports > 0n ? 'text-good' : lamports < 0n ? 'text-bad' : 'text-muted'
    const sign = lamports > 0n ? '+' : lamports < 0n ? '−' : ''
    const magnitude = lamports < 0n ? -lamports : lamports
    const share = base && base > 0n ? ` (${sign}${((Number(magnitude) / Number(base)) * 100).toFixed(1)}%)` : ''
    return (
        <span className={`num ${tone}`}>
            {sign}
            {sol(magnitude)} SOL{share}
        </span>
    )
}

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div className="min-w-0 md:px-6 md:first:pl-0 md:last:pr-0">
            <div className="text-xs text-muted">{label}</div>
            <div className="num mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight">{children}</div>
            {hint && <div className="text-xs text-faint">{hint}</div>}
        </div>
    )
}

interface Row {
    position: Position
    value: bigint | null
    cost: bigint | null
    unrealized: bigint | null
}

const ACTIVITY_LABEL: Record<Activity['kind'], string> = { buy: 'Bought', sell: 'Sold', launch: 'Launched', commit: 'Committed a scheme', claim: 'Claimed prize', close: 'Closed attempt' }
const ACTIVITY_SHOWN = 25

export default function Me() {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const { setVisible } = useWalletModal()
    const problems = useProblems()
    const portfolio = useQuery({
        queryKey: ['portfolio', publicKey?.toBase58(), problems.dataUpdatedAt],
        enabled: !!publicKey && !!problems.data,
        queryFn: () => fetchPortfolio(connection, publicKey!, problems.data!),
        placeholderData: (previous) => previous,
    })
    const activity = useQuery({
        queryKey: ['activity', publicKey?.toBase58()],
        enabled: !!publicKey && !!problems.data,
        queryFn: () => fetchActivity(connection, publicKey!, problems.data!),
        refetchInterval: 60_000,
    })

    const rows: Row[] = useMemo(() => {
        const held = portfolio.data?.positions.filter((p) => p.tokens > 0n) ?? []
        return held.map((position) => {
            const value = position.valueSol === null ? null : lamportsOf(position.valueSol)
            const trades = activity.data?.filter((a) => a.problem === position.problem.address)
            const basis = trades ? costBasis(trades) : null
            const cost = basis && basis.tokens === position.tokens ? basis.cost : null
            return { position, value, cost, unrealized: value !== null && cost !== null ? value - cost : null }
        })
    }, [portfolio.data, activity.data])

    if (!publicKey)
        return (
            <div className="space-y-8">
                <PageIntro title="Your portfolio">
                    Connect a wallet to see what you hold and what it made, your solve attempts, anything you can claim, and how much your trading added to prizes.
                </PageIntro>
                <button onClick={() => setVisible(true)} className={BUTTON}>
                    Connect wallet
                </button>
            </div>
        )

    const error = problems.error ?? portfolio.error
    const data = portfolio.data
    const attempts = data?.positions.filter((p) => p.attempt) ?? []
    const claimable = data?.positions.filter((p) => p.claimable && totalBounty(p.problem) > 0n) ?? []
    const holdings = rows.reduce((sum, r) => sum + (r.value ?? 0n), 0n)
    const priced = rows.filter((r) => r.unrealized !== null)
    const unrealized = priced.reduce((sum, r) => sum + r.unrealized!, 0n)
    const realized = activity.data ? [...new Set(activity.data.map((a) => a.problem))].reduce((sum, address) => sum + costBasis(activity.data!.filter((a) => a.problem === address)).realized, 0n) : 0n
    const funded = activity.data ? bountyFunded(activity.data) : null
    const byAddress = new Map((problems.data ?? []).map((p) => [p.address, p]))
    const address = publicKey.toBase58()
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(address)
            toast.success('Address copied')
        } catch {
            toast.error('Could not copy the address')
        }
    }

    return (
        <div className="space-y-12">
            <PageIntro title="Your portfolio">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono">{short(address)}</span>
                    <button onClick={copy} className="rounded-full border border-border px-3 py-1 text-xs hover:text-text">
                        Copy
                    </button>
                    <a href={explorer('address', address)} target="_blank" rel="noreferrer" className="rounded-full border border-border px-3 py-1 text-xs hover:text-text">
                        Explorer
                    </a>
                </span>
            </PageIntro>
            {error && <ErrorPanel error={error} what="Could not load your portfolio" onRetry={() => (problems.error ? problems.refetch() : portfolio.refetch())} />}
            {!data && !error && <Skeleton className="h-64" />}
            {data && (
                <>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-6 md:flex md:justify-between md:divide-x md:divide-border">
                        <Stat label="Total value" hint={`${sol(data.lamports)} SOL in the wallet`}>
                            {sol(data.lamports + holdings)} SOL
                        </Stat>
                        <Stat label="Holdings" hint="at the current curve price">
                            {sol(holdings)} SOL
                        </Stat>
                        <Stat label="Gain/loss" hint={activity.data ? `realized ${realized < 0n ? '−' : ''}${sol(realized < 0n ? -realized : realized)} SOL` : 'reading your trades…'}>
                            {activity.data ? <Pnl lamports={unrealized + realized} /> : <Skeleton className="mt-1 h-6 w-24" />}
                        </Stat>
                        <Stat label="Added to prizes" hint="the fees your trades paid">
                            {funded === null ? <Skeleton className="mt-1 h-6 w-24" /> : `${sol(funded)} SOL`}
                        </Stat>
                    </div>

                    {(claimable.length > 0 || attempts.length > 0) && (
                        <section className="space-y-4 border-t border-border pt-8" aria-labelledby="todo">
                            <h2 id="todo" className="text-xl font-semibold tracking-tight">
                                Needs your attention
                            </h2>
                            {claimable.map(({ problem }) => (
                                <Panel key={problem.address} className="border-good/40 p-4">
                                    <p className="mb-2 text-sm">
                                        <Link href={`/p/${problem.address}`} className="font-mono hover:underline">
                                            {statement(problem)}
                                        </Link>{' '}
                                        <span className="text-good">· solved by you · {sol(totalBounty(problem))} SOL to claim</span>
                                    </p>
                                    <ClaimPanel problem={problem} />
                                </Panel>
                            ))}
                            {attempts.length > 0 && (
                                <ul className="space-y-2">
                                    {attempts.map(({ problem, attempt }) => (
                                        <AttemptRow key={problem.address} problem={problem} attempt={attempt!} owner={publicKey} />
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}

                    <section className="space-y-4 border-t border-border pt-8" aria-labelledby="holdings">
                        <h2 id="holdings" className="text-xl font-semibold tracking-tight">
                            Positions
                        </h2>
                        {rows.length === 0 ? (
                            <Panel className="border-dashed p-8 text-center text-sm text-muted">
                                <p>You hold no problem tokens yet. Every trade adds to a bounty for whoever beats a record.</p>
                                <Link href="/" className={`mt-4 ${BUTTON}`}>
                                    Browse problems
                                </Link>
                            </Panel>
                        ) : (
                            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                                <table className="w-full min-w-[44rem] text-sm">
                                    <thead className="text-left text-xs text-muted">
                                        <tr>
                                            <th className="p-3 font-normal">Problem</th>
                                            <th className="p-3 text-right font-normal">Tokens</th>
                                            <th className="p-3 text-right font-normal">Value</th>
                                            <th className="p-3 text-right font-normal">Cost</th>
                                            <th className="p-3 text-right font-normal">P&amp;L</th>
                                            <th className="p-3 text-right font-normal">Prize</th>
                                            <th className="p-3 font-normal">
                                                <span className="sr-only">Actions</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(({ position: { problem, tokens: atoms }, value, cost, unrealized: pnl }) => (
                                            <tr key={problem.address} className="border-t border-border">
                                                <td className="p-3">
                                                    <span className="flex items-center gap-3">
                                                        <MatrixArt problem={problem} className="h-10 w-14 shrink-0 rounded-lg p-1" />
                                                        <span className="min-w-0">
                                                            <Link href={`/p/${problem.address}`} className="font-medium hover:underline">
                                                                {cardTitle(problem.account)}
                                                            </Link>
                                                            <span className="block text-xs text-muted">
                                                                {problem.info.symbol} ·{' '}
                                                                {problem.phase === 'solved' ? 'solved' : problem.graduated ? 'graduated' : `curve ${percentDown(problem.curveProgress, 1)}`}
                                                            </span>
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="num p-3 text-right">{tokens(atoms)}</td>
                                                <td className="num p-3 text-right">{value === null ? <span className="text-muted">on DAMM v2</span> : `${sol(value)} SOL`}</td>
                                                <td className="num p-3 text-right text-muted">{cost === null ? (activity.isLoading ? '…' : '—') : `${sol(cost)} SOL`}</td>
                                                <td className="p-3 text-right">{pnl === null ? <span className="text-muted">—</span> : <Pnl lamports={pnl} base={cost ?? undefined} />}</td>
                                                <td className="num p-3 text-right text-muted">{sol(totalBounty(problem))} SOL</td>
                                                <td className="p-3">
                                                    <div className="flex justify-end gap-2">
                                                        <QuickBuy problem={problem} />
                                                        <Link href={`/p/${problem.address}#sell`} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-text">
                                                            Sell
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <More label="How value and cost are worked out">
                            <p className="text-xs text-muted">
                                Value is tokens × the current curve price, before the fee and price impact of selling. Cost is the average price your trades paid,
                                fees included; it shows — when tokens arrived another way.
                            </p>
                        </More>
                    </section>

                    <section className="space-y-4 border-t border-border pt-8" aria-labelledby="activity">
                        <h2 id="activity" className="text-xl font-semibold tracking-tight">
                            Activity
                        </h2>
                        {activity.isLoading && <Skeleton className="h-32" />}
                        {activity.error && <ErrorPanel error={activity.error} what="Could not read your activity" onRetry={() => activity.refetch()} />}
                        {activity.data && activity.data.length === 0 && <Panel className="border-dashed p-6 text-center text-sm text-muted">No trades or submissions yet.</Panel>}
                        {activity.data && activity.data.length > 0 && (
                            <div className="divide-y divide-border">
                                {[...activity.data]
                                    .reverse()
                                    .slice(0, ACTIVITY_SHOWN)
                                    .map((a, i) => {
                                        const problem = byAddress.get(a.problem)
                                        return (
                                            <div key={`${a.signature}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
                                                <span className="min-w-0">
                                                    <span className={a.kind === 'buy' ? 'text-good' : a.kind === 'sell' ? 'text-bad' : a.kind === 'claim' ? 'text-good' : ''}>
                                                        {ACTIVITY_LABEL[a.kind]}
                                                    </span>{' '}
                                                    {problem && (
                                                        <Link href={`/p/${problem.address}`} className="font-mono text-muted hover:text-text hover:underline">
                                                            {statement(problem)}
                                                        </Link>
                                                    )}
                                                </span>
                                                <span className="num flex items-center gap-3 text-muted">
                                                    {a.tokens !== undefined && <span>{tokens(a.tokens)} tokens</span>}
                                                    {a.lamports !== undefined && <span className="text-text">{sol(a.lamports)} SOL</span>}
                                                    <a href={explorer('tx', a.signature)} target="_blank" rel="noreferrer" className="text-xs hover:text-text hover:underline">
                                                        {ago(a.time) || 'tx'}
                                                    </a>
                                                </span>
                                            </div>
                                        )
                                    })}
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    )
}
