import type { ProblemView } from '@/lib/chain'
import { Panel, shape } from '../ui'

export function Staircase({ problem }: { problem: ProblemView }) {
    const { naive, target } = shape(problem)
    const best = problem.info.bestKnown
    const steps = [
        { label: 'Schoolbook', rank: naive },
        ...(best ? [{ label: 'Best published', rank: best.rank }] : []),
        { label: 'Target', rank: target },
    ]
    return (
        <Panel className="p-5">
            <h2 className="mb-4 font-medium">The record to beat</h2>
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
                    Best known from{' '}
                    <a className="underline hover:text-muted" href={best.url} target="_blank" rel="noreferrer">
                        {best.source}
                    </a>
                    , snapshot {best.asOf}
                    {best.ring ? `, over ${best.ring}.` : '. The coefficient ring of that entry is not yet confirmed.'}
                </p>
            )}
        </Panel>
    )
}
