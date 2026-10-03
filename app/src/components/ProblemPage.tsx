'use client'

import { type ReactNode, useState } from 'react'
import Link from 'next/link'
import { useProblem } from '@/hooks/useProblems'
import { ForeignProblemError, type ProblemView } from '@/lib/chain'
import { ErrorPanel } from './ErrorPanel'
import { BuyBar } from './problem/BuyBar'
import { ForResearchers } from './problem/ForResearchers'
import { History } from './problem/History'
import { MarketPanel } from './problem/MarketPanel'
import { PriceChart } from './problem/PriceChart'
import { ProblemHeader } from './problem/ProblemHeader'
import { Rules } from './problem/Rules'
import { Staircase } from './problem/Staircase'
import { TradeFeed } from './problem/TradeFeed'
import { VerifierReplay } from './problem/VerifierReplay'
import { Panel, Skeleton } from './ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-t border-border pt-8">
            <h2 className="mb-5 text-xl font-semibold tracking-tight">{title}</h2>
            {children}
        </section>
    )
}

const TABS = ['History', 'Trades'] as const

function Activity({ problem }: { problem: ProblemView }) {
    const [tab, setTab] = useState<(typeof TABS)[number]>('History')
    return (
        <div>
            <div role="tablist" aria-label="Activity" className="mb-5 inline-flex rounded-full bg-panel-2 p-1 text-sm">
                {TABS.map((name) => (
                    <button
                        key={name}
                        role="tab"
                        id={`tab-${name}`}
                        aria-selected={tab === name}
                        aria-controls={`panel-${name}`}
                        onClick={() => setTab(name)}
                        className={`rounded-full px-4 py-1.5 ${tab === name ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text'}`}
                    >
                        {name}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'History' ? <History problem={problem} /> : <TradeFeed problem={problem} />}
            </div>
        </div>
    )
}

export function ProblemPage({ address }: { address: string }) {
    const { data: problem, isLoading, error, refetch } = useProblem(address)
    if (error instanceof ForeignProblemError) return <ForeignProblem address={address} launchpad={error.launchpad} />
    if (error) {
        const missing = /Account does not exist|has no data|Invalid public key|Non-base58|invalid/i.test(String(error))
        return missing ? <ProblemNotFound address={address} /> : <ErrorPanel error={error} what="Could not load this problem" onRetry={() => refetch()} />
    }
    if (isLoading || !problem) {
        return (
            <div className="space-y-8" aria-busy="true" aria-label="Loading problem">
                <div className="grid gap-8 lg:grid-cols-2">
                    <div className="space-y-4">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-14 w-80" />
                        <Skeleton className="h-16" />
                    </div>
                    <Skeleton className="aspect-[16/10] rounded-3xl" />
                </div>
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <Skeleton className="h-48" />
                    <Skeleton className="h-80" />
                </div>
            </div>
        )
    }
    return (
        <div className="space-y-12 pb-20 lg:pb-0">
            <ProblemHeader problem={problem} />
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
                <aside id="trade-card" className="lg:sticky lg:top-20 lg:order-2 lg:self-start">
                    <MarketPanel problem={problem} />
                </aside>
                <div className="min-w-0 space-y-12 lg:order-1">
                    <Section title="The challenge">
                        <Staircase problem={problem} />
                        <h3 className="mb-2 mt-8 font-medium">Rules</h3>
                        <Rules problem={problem} />
                    </Section>
                    <Section title="Market">
                        <PriceChart problem={problem} />
                    </Section>
                    {problem.account.solver && (
                        <Section title="Check the answer yourself">
                            <VerifierReplay problem={problem} />
                        </Section>
                    )}
                    <Section title="Activity">
                        <Activity problem={problem} />
                    </Section>
                    <Section title="For researchers">
                        <ForResearchers problem={problem} />
                    </Section>
                </div>
            </div>
            <BuyBar problem={problem} watch="trade-card" />
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

function ForeignProblem({ address, launchpad }: { address: string; launchpad: string }) {
    return (
        <Panel role="alert" className="mx-auto max-w-lg space-y-3 border-warn/40 p-6 text-center">
            <h1 className="text-lg font-medium">Not a meteortoll problem</h1>
            <p className="text-sm text-muted">
                This account was registered on another launchpad, with its own launch settings. Its trading fees may not go to a bounty at all. meteortoll does not list or vouch for
                it.
            </p>
            <p className="break-all font-mono text-xs text-faint">
                {address}
                <br />
                launchpad {launchpad}
            </p>
            <Link href="/" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
                See meteortoll&apos;s problems
            </Link>
        </Panel>
    )
}
