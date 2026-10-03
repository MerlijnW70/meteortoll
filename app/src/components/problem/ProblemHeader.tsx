import type { ReactNode } from 'react'
import Link from 'next/link'
import { useHistory } from '@/hooks/useHistory'
import { useStats } from '@/hooks/useStats'
import { cardChip, cardTitle, shareState } from '@/lib/card'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { problemStanding, standingNote } from '@/lib/classify'
import { CLUSTER } from '@/lib/config'
import { paidOut } from '@/lib/history'
import { MatrixArt } from '../MatrixArt'
import { CHIP, CHIP_TONE, DOT } from '../ProblemCard'
import { Share } from '../Share'
import { shape, short, sol } from '../ui'

const SLOT_SECONDS = 0.4

function Stat({ label, value, sub, big = false }: { label: string; value: ReactNode; sub?: ReactNode; big?: boolean }) {
    return (
        <div className="min-w-0 first:col-span-2 sm:px-5 sm:first:pl-0 sm:last:pr-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`num mt-1 whitespace-nowrap font-semibold tracking-tight ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</dd>
            {sub && <dd className="num mt-0.5 text-xs text-faint">{sub}</dd>}
        </div>
    )
}

function PrizeStat({ problem }: { problem: ProblemView }) {
    const total = totalBounty(problem)
    const parts = [
        problem.unsweptLamports > 0n && `${sol(problem.unsweptLamports)} SOL not yet swept`,
        problem.bondsLamports > 0n && `${sol(problem.bondsLamports)} SOL from forfeited bonds`,
    ].filter(Boolean)
    const sub = parts.length > 0 ? parts.join(' · ') : total === 0n ? 'grows with every trade' : 'all fees swept'
    return <Stat big label="Prize" value={`${sol(total)} SOL`} sub={sub} />
}

function PaidStat({ problem }: { problem: ProblemView }) {
    const stats = useStats()
    const history = useHistory(problem.address)
    const counted = stats.data?.perProblem[problem.address]?.paidLamports
    const value = counted !== undefined ? `${sol(counted)} SOL` : history.data ? `${sol(paidOut(history.data))} SOL` : history.error ? '—' : '…'
    return <Stat big label="Paid to the solver" value={value} sub={`${sol(totalBounty(problem))} SOL left to claim`} />
}

function summary(problem: ProblemView): string {
    const { n1, n2, n3, solvedRank, solver } = problem.account
    const { target, naive } = shape(problem)
    const best = problem.info.bestKnown?.rank
    if (problem.phase === 'solved') return `Solved in ${solvedRank} steps${solver ? ` by ${short(solver.toBase58())}` : ''} and verified on-chain. Trading fees keep flowing to the solver.`
    if (problem.phase === 'grace') {
        const left = problem.graceEndsAtSlot ? Math.max(0, problem.graceEndsAtSlot - problem.slot) : 0
        return `A ${solvedRank}-step answer passed the on-chain check. It wins unless an earlier commitment also holds within about ${Math.max(1, Math.ceil((left * SLOT_SECONDS) / 60))} min.`
    }
    return `Find a way to multiply a ${n1}×${n2} matrix by a ${n2}×${n3} matrix in ${target} steps. ${best ? `The best known way takes ${best}.` : `The usual way takes ${naive}.`}`
}

export function ProblemHeader({ problem }: { problem: ProblemView }) {
    const { label, target, naive } = shape(problem)
    const best = problem.info.bestKnown?.rank
    const { n1, n2, n3 } = problem.account
    const standing = problemStanding(problem, CLUSTER === 'mainnet')
    const chip = cardChip(problem, CLUSTER === 'mainnet')
    const solver = problem.account.solver?.toBase58()
    return (
        <header className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-muted">
                        <Link href="/#problems" className="hover:text-text">
                            ← Problems
                        </Link>
                        <span aria-hidden>·</span>
                        <span className="truncate font-mono">
                            ⟨{label} : ≤{target}⟩
                        </span>
                    </span>
                    <Share
                        text={
                            {
                                prize: `Multiply a ${n1}×${n2} by a ${n2}×${n3} matrix with ${target} multiplications and claim the ${sol(totalBounty(problem))} SOL prize. Checked on-chain, no committee.`,
                                demo: `⟨${label} : ≤${target}⟩ on meteortoll: a disclosed demo of a math problem you can trade, checked on-chain.`,
                                notWinnable: `⟨${label} : ≤${target}⟩ on meteortoll. This target is already answered or impossible.`,
                                unreviewed: `⟨${label} : ≤${target}⟩ on meteortoll, launched by someone else and not reviewed.`,
                                review: `An answer to ⟨${label} : ≤${target}⟩ just passed the on-chain check. Watch the grace window:`,
                                solved: `⟨${label} : ≤${target}⟩ was solved and verified on-chain. Check the scheme yourself:`,
                            }[shareState(problem, CLUSTER === 'mainnet')]
                        }
                    />
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                    <span className={CHIP}>
                        <span className={`${DOT} ${CHIP_TONE[chip.tone]} ${chip.live ? 'live-dot' : ''}`} />
                        {chip.label}
                    </span>
                    {problem.info.kind === 'demo' && <span className="rounded-full border border-warn/40 px-2.5 py-1 text-xs font-medium text-warn">Demo</span>}
                </div>
                <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{cardTitle(problem.account)}</h1>
                <p className="mt-4 max-w-xl text-lg text-muted">{summary(problem)}</p>
                {standing && <p className="mt-3 max-w-xl text-sm text-warn">{standingNote(standing, [n1, n2, n3], best)}</p>}
                {problem.info.kind === 'demo' && problem.info.demoNote && (
                    <p className="mt-3 max-w-xl text-sm text-muted">
                        <span className="font-medium text-warn">Demo: </span>
                        {problem.info.demoNote.replace(/^Disclosed demo:\s*/i, '')}
                    </p>
                )}
                <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:gap-0 sm:divide-x sm:divide-border">
                    {problem.phase === 'solved' ? <PaidStat problem={problem} /> : <PrizeStat problem={problem} />}
                    <Stat label="Record to beat" value={best ? `${best} → ${target}` : `≤ ${target}`} sub={`usual way ${naive}`} />
                    <Stat label="Attempts" value={problem.account.attempts} sub={solver ? `solver ${short(solver)}` : 'no answer yet'} />
                </dl>
            </div>
            <div className="hidden sm:block">
                <MatrixArt problem={problem} className="aspect-[16/10] rounded-3xl p-6" />
            </div>
        </header>
    )
}
