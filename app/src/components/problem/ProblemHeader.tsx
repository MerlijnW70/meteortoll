import type { ReactNode } from 'react'
import type { ProblemView } from '@/lib/chain'
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
            {problem.info.kind !== 'demo' && problem.info.teamMeetsTarget && problem.info.team && (
                <Panel className="border-warn/30 bg-warn/5 p-4 text-sm text-warn">
                    Disclosure: the meteortoll team&apos;s search tool ({problem.info.team.tool}) already holds a rank-{problem.info.team.rank} scheme for this
                    format, which meets this target. If the team ever submits it, it will say so publicly.
                </Panel>
            )}
            <Panel className="grid gap-6 p-5 sm:grid-cols-3">
                <Stat
                    label={problem.phase === 'solved' ? 'Unclaimed fees' : 'Bounty'}
                    value={`${sol(problem.bountyLamports + problem.unsweptLamports)} SOL`}
                    sub={
                        problem.phase === 'solved'
                            ? 'new fees, claimed by the solver as they arrive'
                            : problem.unsweptLamports > 0n
                              ? `${sol(problem.unsweptLamports)} SOL not yet swept`
                              : problem.bountyLamports === 0n
                                ? 'grows with every trade'
                                : 'all fees swept'
                    }
                />
                <Stat label="Record to beat" value={best ? `${best} → ${target}` : `≤ ${target}`} sub={`schoolbook ${naive} · ${Math.round((1 - target / naive) * 100)}% fewer`} />
                <Stat label="Status" value={status} sub={`${problem.account.attempts} commitment${problem.account.attempts === 1 ? '' : 's'}`} />
            </Panel>
        </>
    )
}
