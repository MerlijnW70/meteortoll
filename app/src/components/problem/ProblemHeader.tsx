import type { ReactNode } from 'react'
import { useHistory } from '@/hooks/useHistory'
import type { ProblemView } from '@/lib/chain'
import { paidOut } from '@/lib/history'
import { Share } from '../Share'
import { Panel, shape, sol, StatusBadge } from '../ui'

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div>
            <div className="text-xs text-muted">{label}</div>
            <div className="num text-2xl font-semibold">{value}</div>
            {sub && <div className="num text-xs text-faint">{sub}</div>}
        </div>
    )
}

function BountyStat({ problem }: { problem: ProblemView }) {
    const total = problem.bountyLamports + problem.unsweptLamports
    const sub =
        problem.unsweptLamports > 0n ? `${sol(problem.unsweptLamports)} SOL not yet swept` : total === 0n ? 'grows with every trade' : 'all fees swept'
    return <Stat label="Bounty" value={`${sol(total)} SOL`} sub={sub} />
}

/// What the solver has been paid, from the claim transactions, and what waits for their next claim.
function PaidStat({ problem }: { problem: ProblemView }) {
    const history = useHistory(problem.address)
    const waiting = problem.bountyLamports + problem.unsweptLamports
    const value = history.data ? `${sol(paidOut(history.data))} SOL` : history.error ? '—' : '…'
    return <Stat label="Paid to the solver" value={value} sub={`${sol(waiting)} SOL in fees waiting for the next claim`} />
}

/// Title, status, share actions, demo disclosure and the three headline numbers.
export function ProblemHeader({ problem }: { problem: ProblemView }) {
    const { label, target, naive } = shape(problem)
    const best = problem.info.bestKnown?.rank
    const { n1, n2, n3 } = problem.account
    const status = problem.phase === 'open' ? 'Open' : problem.phase === 'grace' ? 'Verifying' : 'Solved'
    return (
        <>
            <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <StatusBadge problem={problem} />
                    <Share
                        text={
                            problem.phase === 'open'
                                ? `Multiply a ${n1}×${n2} by a ${n2}×${n3} matrix with ${target} multiplications and claim the ${sol(problem.bountyLamports + problem.unsweptLamports)} SOL bounty. Checked on-chain, no committee.`
                                : `⟨${label} : ≤${target}⟩ was solved and verified on-chain. Check the scheme yourself:`
                        }
                    />
                </div>
                <h1 className="mt-3 font-mono text-3xl tracking-tight">
                    ⟨{label} : ≤{target}⟩
                </h1>
                <p className="mt-1 text-muted">
                    {problem.info.name} · multiply a {n1}×{n2} by a {n2}×{n3} matrix in {target} multiplications
                </p>
            </div>
            {problem.info.kind === 'demo' && problem.info.demoNote && (
                <Panel className="border-warn/30 bg-warn/5 p-4 text-sm text-warn">{problem.info.demoNote}</Panel>
            )}
            <Panel className="grid gap-6 p-5 sm:grid-cols-3">
                {problem.phase === 'solved' ? <PaidStat problem={problem} /> : <BountyStat problem={problem} />}
                <Stat label="Record to beat" value={best ? `${best} → ${target}` : `≤ ${target}`} sub={`schoolbook ${naive} · ${Math.round((1 - target / naive) * 100)}% fewer`} />
                <Stat label="Status" value={status} sub={`${problem.account.attempts} commitment${problem.account.attempts === 1 ? '' : 's'}`} />
            </Panel>
        </>
    )
}
