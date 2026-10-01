'use client'

import { toast } from 'sonner'
import { explorer } from './config'
import { describeError, type Friendly } from './errors'

function Detail({ friendly }: { friendly: Friendly }) {
    return (
        <span className="block space-y-1">
            {friendly.detail && <span className="block">{friendly.detail}</span>}
            {friendly.signature && (
                <a href={explorer('tx', friendly.signature)} target="_blank" rel="noreferrer" className="underline">
                    View transaction
                </a>
            )}
        </span>
    )
}

/// Shows an error the way people need it: a cancel is information, not a failure; everything
/// else gets a plain title, what to do next, and the transaction when there is one. The raw
/// error still goes to the console for debugging.
export function notifyError(error: unknown, toastId?: string | number): Friendly {
    const friendly = describeError(error)
    console.error('[meteortoll]', friendly.title, error)
    const options = { id: toastId, description: <Detail friendly={friendly} /> }
    if (friendly.kind === 'cancelled') toast.info(friendly.title, options)
    else if (friendly.kind === 'busy' || friendly.kind === 'expired') toast.warning(friendly.title, options)
    else toast.error(friendly.title, options)
    return friendly
}

export function notifySuccess(title: string, signature?: string, toastId?: string | number) {
    toast.success(title, {
        id: toastId,
        description: signature ? (
            <a href={explorer('tx', signature)} target="_blank" rel="noreferrer" className="underline">
                View transaction
            </a>
        ) : undefined,
    })
}
