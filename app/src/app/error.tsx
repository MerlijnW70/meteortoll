'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { describeError } from '@/lib/errors'
import { sendReport } from '@/lib/report'

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error('[meteortoll] page error', error)
        sendReport('render', error)
    }, [error])
    const friendly = describeError(error)
    return (
        <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-bad/40 bg-panel p-6 text-center">
            <h1 className="text-lg font-medium">This page ran into a problem</h1>
            <p className="text-sm text-muted">
                {friendly.title}
                {friendly.detail ? `. ${friendly.detail}` : '.'}
            </p>
            {error.digest && <p className="font-mono text-xs text-faint">reference {error.digest}</p>}
            <div className="flex justify-center gap-3">
                <button onClick={() => retry()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
                    Try again
                </button>
                <Link href="/" className="rounded-lg border border-border px-4 py-2 text-sm">
                    All problems
                </Link>
            </div>
            <p className="text-xs text-faint">No transaction is sent without your wallet&apos;s approval, so nothing was charged by this error.</p>
        </div>
    )
}
