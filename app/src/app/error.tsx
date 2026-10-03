'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { BUTTON, BUTTON_QUIET, PageIntro } from '@/components/ui'
import { describeError } from '@/lib/errors'
import { sendReport } from '@/lib/report'

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error('[meteortoll] page error', error)
        sendReport('render', error)
    }, [error])
    const friendly = describeError(error)
    return (
        <div role="alert" className="space-y-6 py-10">
            <PageIntro eyebrow="Something went wrong" title="This page ran into a problem.">
                {friendly.title}
                {friendly.detail ? `. ${friendly.detail}` : '.'}
            </PageIntro>
            {error.digest && <p className="font-mono text-xs text-faint">reference {error.digest}</p>}
            <div className="flex flex-wrap gap-3">
                <button onClick={() => retry()} className={BUTTON}>
                    Try again
                </button>
                <Link href="/" className={BUTTON_QUIET}>
                    All problems
                </Link>
            </div>
            <p className="text-xs text-faint">No transaction is sent without your wallet&apos;s approval, so nothing was charged by this error.</p>
        </div>
    )
}
