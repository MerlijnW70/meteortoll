'use client'

import Link from 'next/link'
import { useProblem } from '@/hooks/useProblems'
import { ErrorPanel } from './ErrorPanel'
import { ForResearchers } from './problem/ForResearchers'
import { History } from './problem/History'
import { Lifecycle } from './problem/Lifecycle'
import { MarketPanel } from './problem/MarketPanel'
import { PriceChart } from './problem/PriceChart'
import { ProblemHeader } from './problem/ProblemHeader'
import { Rules } from './problem/Rules'
import { Staircase } from './problem/Staircase'
import { SweepBar } from './problem/SweepBar'
import { TradeFeed } from './problem/TradeFeed'
import { VerifierReplay } from './problem/VerifierReplay'
import { Panel, Skeleton } from './ui'

export function ProblemPage({ address }: { address: string }) {
    const { data: problem, isLoading, error, refetch } = useProblem(address)
    if (error) {
        const missing = /Account does not exist|has no data|Invalid public key|Non-base58|invalid/i.test(String(error))
        return missing ? <ProblemNotFound address={address} /> : <ErrorPanel error={error} what="Could not load this problem" onRetry={() => refetch()} />
    }
    if (isLoading || !problem) {
        return (
            <div className="space-y-4" aria-busy="true" aria-label="Loading problem">
                <Skeleton className="h-10 w-80" />
                <Skeleton className="h-28" />
                <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                </div>
            </div>
        )
    }
    return (
        <div className="space-y-6">
            <ProblemHeader problem={problem} />
            <SweepBar problem={problem} />
            <div className="grid gap-4 md:grid-cols-2">
                <Staircase problem={problem} />
                <MarketPanel problem={problem} />
            </div>
            <PriceChart problem={problem} />
            <div className="grid gap-4 md:grid-cols-2">
                <Rules problem={problem} />
                <Lifecycle problem={problem} />
            </div>
            {problem.account.solver && <VerifierReplay problem={problem} />}
            <div className="grid gap-4 md:grid-cols-2">
                <TradeFeed problem={problem} />
                <History problem={problem} />
            </div>
            <ForResearchers problem={problem} />
        </div>
    )
}

function ProblemNotFound({ address }: { address: string }) {
    return (
        <Panel className="mx-auto max-w-lg space-y-3 p-6 text-center">
            <h1 className="text-lg font-medium">No problem at this address</h1>
            <p className="break-all font-mono text-xs text-faint">{address}</p>
            <p className="text-sm text-muted">The link may be mistyped, or the problem is on another network than this site shows.</p>
            <Link href="/" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
                See all problems
            </Link>
        </Panel>
    )
}
