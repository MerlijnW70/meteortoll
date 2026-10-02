'use client'

import { statusName } from '@meteortoll/core'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { Panel, shape, sol } from '../ui'
import { StepList } from './StepList'
import { BOND_SOL, currentStep, isClaimed } from './steps'
import { count } from '@/lib/format'
import { useSolveActions } from './useSolveActions'

export function SolveFlow({ problem, scheme }: { problem: ProblemView; scheme: Uint8Array }) {
    const { publicKey, attempt, busy, note, links, work, won, final, run, abandon } = useSolveActions(problem, scheme)
    const status = attempt ? statusName(attempt.status) : null
    const current = currentStep(status, won, final)
    const failed = status === 'fails'
    const lost = status === 'holds' && !won
    const graceLeft = problem.graceEndsAtSlot ? Math.max(0, problem.graceEndsAtSlot - problem.slot) : 0

    const action = !publicKey
        ? 'Connect wallet'
        : !attempt
          ? problem.phase === 'open'
              ? `Commit and stake ${BOND_SOL} SOL`
              : null
          : status === 'committed'
            ? 'Upload, reveal and verify'
            : status === 'revealed'
              ? 'Finish verification'
              : won && final
                ? `Claim ${sol(totalBounty(problem))} SOL`
                : null
    const canClose = !!attempt && (status === 'committed' || failed || lost)

    return (
        <Panel className="space-y-4 p-5">
            <div>
                <h3 className="font-medium">
                    Submit to <span className="font-mono">⟨{shape(problem).label} : ≤{problem.account.targetRank}⟩</span>
                </h3>
                <p className="text-xs text-muted">
                    {count(work)} units of on-chain work · about {Math.ceil(work / 10_000)} verification transaction{work > 10_000 ? 's' : ''}
                </p>
            </div>
            <StepList current={current} failed={failed} claimed={isClaimed(status, won, !!links.claim)} links={links} graceMinutes={Math.ceil((graceLeft * 0.4) / 60)} />
            {!attempt && problem.phase !== 'open' && publicKey && (
                <p className="rounded-lg bg-panel-2 p-3 text-sm text-muted">
                    {won ? 'You solved this problem. Claim new fees from the problem page as they arrive.' : 'This problem already has a verified scheme; new commitments are closed.'}
                </p>
            )}
            {failed && <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad">The scheme did not hold at the random point. The bond went to the bounty.</p>}
            {lost && (
                <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">Your scheme holds, but an earlier commitment took the solve. Close the attempt to get your bond back.</p>
            )}
            <p className="min-h-5 text-sm text-accent-2" aria-live="polite">
                {note}
            </p>
            <div className="flex flex-wrap gap-2">
                {action && (
                    <button onClick={run} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-40">
                        {busy ? 'Working…' : action}
                    </button>
                )}
                {canClose && (
                    <button onClick={abandon} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-text disabled:opacity-40">
                        {status === 'committed' ? 'Abandon and refund bond' : 'Close attempt'}
                    </button>
                )}
            </div>
        </Panel>
    )
}
