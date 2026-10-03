'use client'

import { useState } from 'react'
import { TOLL } from '@meteortoll/core'
import type { ProblemView } from '@/lib/chain'
import { errorBoundText } from '@/lib/bound'
import { shape, short } from '../ui'

const SLOT_SECONDS = 0.4

export function Rules({ problem }: { problem: ProblemView }) {
    const [open, setOpen] = useState(false)
    const { target } = shape(problem)
    const coefficients = problem.info.coefficients
    const grace = problem.account.graceSlots.toNumber()
    return (
        <div>
            <ul className="space-y-1.5 text-sm">
                <li>
                    <span className="text-muted">What counts · </span>a scheme with rank ≤ {target}, coefficients {coefficients}.
                </li>
                <li>
                    <span className="text-muted">Who decides · </span>program <span className="font-mono">{short(TOLL.toBase58())}</span>, instruction{' '}
                    <span className="font-mono">verify</span>. No committee, no oracle.
                </li>
                <li>
                    <span className="text-muted">When it pays · </span>after a grace window of {grace} slots (~{Math.max(1, Math.round((grace * SLOT_SECONDS) / 60))} min)
                    from the first verified scheme.
                </li>
            </ul>
            <button onClick={() => setOpen(!open)} className="mt-1 py-2 text-sm text-accent hover:underline" aria-expanded={open}>
                {open ? 'Hide full rules' : 'Full rules'}
            </button>
            {open && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
                    <li>
                        A solver commits a hash of the scheme with a bond, uploads it, then reveals. The random test point comes from a slot hash newer than the
                        commitment.
                    </li>
                    <li>
                        The program checks the scheme as a polynomial identity at that point. A wrong scheme passes with probability at most{' '}
                        {errorBoundText(problem.account.n1, problem.account.n2, problem.account.n3)}.
                    </li>
                    <li>A failing or malformed scheme forfeits its bond to the prize.</li>
                    <li>Earliest commitment wins: anyone copying an upload necessarily commits later, so the copy cannot take the prize.</li>
                    <li>Trading fees keep arriving after a solve, and the solver can claim again.</li>
                    <li>No expiry. The statement is fixed in the problem address and cannot change.</li>
                </ul>
            )}
        </div>
    )
}
