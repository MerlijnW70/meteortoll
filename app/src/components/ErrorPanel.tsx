'use client'

import { describeError } from '@/lib/errors'
import { Panel } from './ui'

/// An inline failure: what went wrong in plain words, what to do, and a retry when one helps.
export function ErrorPanel({ error, what, onRetry }: { error: unknown; what: string; onRetry?: () => void }) {
    const friendly = describeError(error)
    return (
        <Panel role="alert" className="flex flex-wrap items-center justify-between gap-3 border-bad/40 p-4 text-sm">
            <div>
                <p className="font-medium text-bad">
                    {what}: {friendly.title}
                </p>
                {friendly.detail && <p className="mt-0.5 text-muted">{friendly.detail}</p>}
            </div>
            {onRetry && (
                <button onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent/60">
                    Try again
                </button>
            )}
        </Panel>
    )
}
