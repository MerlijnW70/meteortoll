'use client'

import { toast } from 'sonner'
import { explorer } from './config'
import { describeError, type Friendly } from './errors'
import { sendReport, worthReporting } from './report'

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

export function notifyError(error: unknown, toastId?: string | number): Friendly {
    const friendly = describeError(error)
    console.error('[meteortoll]', friendly.title, error)
    if (worthReporting(friendly.kind)) sendReport('action', error)
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
