import Link from 'next/link'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { percentDown } from '@/lib/format'
import { QuickBuy } from './QuickBuy'
import { Meter, Panel, shape, sol, StatusBadge } from './ui'

/// The whole card is clickable through its title link (stretched over the card), while the
/// buy button stays a separate control: no interactive element nested inside another.
export function ProblemCard({ problem }: { problem: ProblemView }) {
    const { label, target, naive } = shape(problem)
    const best = problem.info.bestKnown?.rank
    return (
        <Panel className="relative h-full p-4 transition-colors focus-within:border-accent hover:border-accent/50">
            <div className="mb-3 space-y-2">
                <StatusBadge problem={problem} />
                <div className="flex items-baseline justify-between gap-2">
                    <Link
                        href={`/p/${problem.address}`}
                        className="whitespace-nowrap font-mono text-lg outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                    >
                        ⟨{label} : ≤{target}⟩
                    </Link>
                    <span className="text-xs text-muted">{problem.info.symbol || 'unlisted'}</span>
                </div>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                    <div className="text-xs text-muted">{problem.phase === 'solved' ? 'Unclaimed' : 'Bounty'}</div>
                    <div className="num font-medium">{sol(totalBounty(problem))} SOL</div>
                </div>
                <div>
                    <div className="text-xs text-muted">Best known</div>
                    <div className="num font-medium">{best ?? '—'}</div>
                </div>
                <div>
                    <div className="text-xs text-muted">Schoolbook</div>
                    <div className="num text-muted">{naive}</div>
                </div>
            </div>
            <Meter
                label="Curve to graduation"
                value={problem.graduated ? 1 : problem.curveProgress}
                detail={problem.graduated ? 'graduated' : percentDown(problem.curveProgress, 1)}
            />
            <div className="relative z-10 mt-3 flex justify-end">
                <QuickBuy problem={problem} />
            </div>
        </Panel>
    )
}
