import Link from 'next/link'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { percentDown } from '@/lib/format'
import { QuickBuy } from './QuickBuy'
import { Panel, shape, sol } from './ui'

const PHASE: Record<ProblemView['phase'], [string, string]> = {
    open: ['Open', 'bg-accent/15 text-accent'],
    grace: ['Verifying', 'bg-accent-2/15 text-accent-2'],
    solved: ['Solved', 'bg-good/15 text-good'],
}

export function ProblemCard({ problem, showPhase = false }: { problem: ProblemView; showPhase?: boolean }) {
    const { label, target, naive } = shape(problem)
    const best = problem.info.bestKnown?.rank
    const solved = problem.phase === 'solved'
    const progress = problem.graduated ? 1 : problem.curveProgress
    const [phaseLabel, phaseTone] = PHASE[problem.phase]
    return (
        <Panel className="group relative flex h-full flex-col p-4 transition hover:-translate-y-0.5 hover:border-accent/60 focus-within:border-accent">
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-muted">{problem.info.symbol || 'unlisted'}</span>
                <span className="flex gap-1.5">
                    {problem.info.kind === 'demo' && <span className="rounded-full bg-warn/15 px-2 py-0.5 font-medium text-warn">Demo</span>}
                    {showPhase && <span className={`rounded-full px-2 py-0.5 font-medium ${phaseTone}`}>{phaseLabel}</span>}
                </span>
            </div>

            <Link
                href={`/p/${problem.address}`}
                className="mt-2 whitespace-nowrap font-mono text-lg outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-accent"
            >
                ⟨{label} : ≤{target}⟩
            </Link>
            <p className="num text-xs text-muted">
                {best ? (
                    <>
                        Record {best} → <span className="text-text">{target}</span>
                    </>
                ) : (
                    <>Schoolbook {naive}</>
                )}
            </p>

            <div className="mt-4">
                <div className="text-xs text-muted">{solved ? 'Unclaimed' : 'Bounty'}</div>
                <div className={`num text-2xl font-semibold ${solved ? 'text-text' : 'text-good'}`}>{sol(totalBounty(problem))} SOL</div>
            </div>

            <div className="mt-auto pt-4">
                <div
                    className="h-1.5 overflow-hidden rounded-full bg-panel-2"
                    role="progressbar"
                    aria-label="Curve to graduation"
                    aria-valuenow={Math.round(progress * 1000) / 10}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="num text-xs text-muted">{problem.graduated ? 'Graduated to DAMM v2' : `Curve ${percentDown(progress, 1)}`}</span>
                    <span className="relative z-10">
                        <QuickBuy problem={problem} />
                    </span>
                </div>
            </div>
        </Panel>
    )
}
