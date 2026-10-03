import type { ProblemView } from '@/lib/chain'
import { shape } from '../ui'

export function Staircase({ problem }: { problem: ProblemView }) {
    const { naive, target } = shape(problem)
    const best = problem.info.bestKnown
    const steps = [
        { label: 'Usual way', rank: naive },
        ...(best ? [{ label: 'Best known', rank: best.rank }] : []),
        { label: 'Goal', rank: target },
    ]
    return (
        <div>
            <div className="space-y-3">
                {steps.map((step, i) => (
                    <div key={step.label} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm">
                        <span className="text-muted">{step.label}</span>
                        <div className="h-3 rounded-sm bg-panel-2">
                            <div
                                className={`h-full rounded-sm ${i === steps.length - 1 ? 'bg-accent' : 'bg-faint'}`}
                                style={{ width: `${(step.rank / naive) * 100}%` }}
                            />
                        </div>
                        <span className="num text-right font-medium">{step.rank}</span>
                    </div>
                ))}
            </div>
            {best && (
                <p className="mt-4 text-xs text-faint">
                    <a className="underline hover:text-muted" href={best.url} target="_blank" rel="noreferrer" title={`${best.source}${best.ring ? `, over ${best.ring}` : ''}`}>
                        Record source
                    </a>
                    , {best.asOf}
                </p>
            )}
        </div>
    )
}
