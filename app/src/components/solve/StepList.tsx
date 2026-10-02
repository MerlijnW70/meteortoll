import { explorer } from '@/lib/config'
import { type Step, STEPS, stepState } from './steps'

const badge = {
    done: 'bg-good/20 text-good',
    current: 'bg-accent/25 text-accent',
    failed: 'bg-bad/20 text-bad',
    todo: 'bg-panel-2 text-faint',
}

export function StepList({
    current,
    failed,
    claimed,
    links,
    graceMinutes,
}: {
    current: Step
    failed: boolean
    claimed: boolean
    links: Partial<Record<Step, string>>
    graceMinutes: number
}) {
    return (
        <ol className="space-y-2" aria-label="Submission steps">
            {STEPS.map(([step, title, body], index) => {
                const state = stepState(step, current, failed, claimed)
                return (
                    <li key={step} className="flex gap-3" aria-current={state === 'current' ? 'step' : undefined}>
                        <span aria-hidden className={`num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${badge[state]}`}>
                            {state === 'done' ? '✓' : state === 'failed' ? '✕' : index + 1}
                        </span>
                        <div className="text-sm">
                            <div className={state === 'todo' ? 'text-muted' : ''}>
                                {title}
                                <span className="sr-only"> ({state})</span>
                                {links[step] && (
                                    <a className="ml-2 text-xs text-accent hover:underline" href={explorer('tx', links[step]!)} target="_blank" rel="noreferrer">
                                        transaction
                                    </a>
                                )}
                            </div>
                            {state === 'current' && (
                                <p className="text-xs text-muted">{step === 'grace' ? `${body} Claims open in about ${graceMinutes} min.` : body}</p>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}
