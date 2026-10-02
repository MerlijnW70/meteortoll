'use client'

import Link from 'next/link'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useQuery } from '@tanstack/react-query'
import { ErrorPanel } from '@/components/ErrorPanel'
import { AttemptRow } from '@/components/me/AttemptRow'
import { ClaimPanel } from '@/components/problem/ClaimPanel'
import { PageIntro, Panel, shape, Skeleton, sol } from '@/components/ui'
import { useProblems } from '@/hooks/useProblems'
import { tokens } from '@/lib/format'
import { totalBounty } from '@/lib/chain'
import { fetchPortfolio } from '@/lib/portfolio'

const solNumber = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 })

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs text-muted">{label}</div>
            <div className="num text-lg font-medium">{value}</div>
        </div>
    )
}

export default function Me() {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const { setVisible } = useWalletModal()
    const problems = useProblems()
    const portfolio = useQuery({
        queryKey: ['portfolio', publicKey?.toBase58(), problems.dataUpdatedAt],
        enabled: !!publicKey && !!problems.data,
        queryFn: () => fetchPortfolio(connection, publicKey!, problems.data!),
        placeholderData: (previous) => previous,
    })

    if (!publicKey)
        return (
            <Panel className="mx-auto max-w-md space-y-3 p-8 text-center">
                <h1 className="text-xl font-semibold">Your portfolio</h1>
                <p className="text-sm text-muted">Connect a wallet to see the problems you hold, your solve attempts and anything you can claim.</p>
                <button onClick={() => setVisible(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90">
                    Connect wallet
                </button>
            </Panel>
        )

    const error = problems.error ?? portfolio.error
    const data = portfolio.data
    const held = data?.positions.filter((p) => p.tokens > 0n) ?? []
    const attempts = data?.positions.filter((p) => p.attempt) ?? []
    const claimable = data?.positions.filter((p) => p.claimable) ?? []
    const value = held.reduce((sum, p) => sum + (p.valueSol ?? 0), 0)

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <PageIntro title="Your portfolio">
                <p className="break-all font-mono text-xs text-muted">{publicKey.toBase58()}</p>
            </PageIntro>
            {error && <ErrorPanel error={error} what="Could not load your portfolio" onRetry={() => (problems.error ? problems.refetch() : portfolio.refetch())} />}
            {!data && !error && <Skeleton className="h-64" />}
            {data && (
                <>
                    <Panel className="grid grid-cols-3 gap-4 p-5">
                        <Stat label="Wallet" value={`${sol(data.lamports)} SOL`} />
                        <Stat label="Holdings on the curve" value={`${solNumber(value)} SOL`} />
                        <Stat label="Open attempts" value={String(attempts.length)} />
                    </Panel>

                    {claimable.length > 0 && (
                        <section className="space-y-2" aria-labelledby="claims">
                            <h2 id="claims" className="font-medium">
                                Bounties you won
                            </h2>
                            {claimable.map(({ problem }) => (
                                <Panel key={problem.address} className="p-4">
                                    <Link href={`/p/${problem.address}`} className="font-mono hover:underline">
                                        ⟨{shape(problem).label} : ≤{problem.account.targetRank}⟩
                                    </Link>
                                    <ClaimPanel problem={problem} />
                                </Panel>
                            ))}
                        </section>
                    )}

                    {attempts.length > 0 && (
                        <section className="space-y-2" aria-labelledby="attempts">
                            <h2 id="attempts" className="font-medium">
                                Solve attempts
                            </h2>
                            <ul className="space-y-2">
                                {attempts.map(({ problem, attempt }) => (
                                    <AttemptRow key={problem.address} problem={problem} attempt={attempt!} owner={publicKey} />
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className="space-y-2" aria-labelledby="holdings">
                        <h2 id="holdings" className="font-medium">
                            Problems you hold
                        </h2>
                        {held.length === 0 ? (
                            <Panel className="border-dashed p-6 text-center text-sm text-faint">
                                You hold no problem tokens yet.{' '}
                                <Link href="/" className="text-accent hover:underline">
                                    Browse problems
                                </Link>
                            </Panel>
                        ) : (
                            <Panel className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-xs text-muted">
                                        <tr>
                                            <th className="p-3 font-normal">Problem</th>
                                            <th className="p-3 text-right font-normal">Tokens</th>
                                            <th className="p-3 text-right font-normal">Value</th>
                                            <th className="p-3 text-right font-normal">Bounty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {held.map(({ problem, tokens: atoms, valueSol }) => (
                                            <tr key={problem.address} className="border-t border-border">
                                                <td className="p-3">
                                                    <Link href={`/p/${problem.address}`} className="font-mono hover:underline">
                                                        ⟨{shape(problem).label} : ≤{problem.account.targetRank}⟩
                                                    </Link>
                                                    <span className="ml-2 text-xs text-muted">{problem.info.symbol}</span>
                                                </td>
                                                <td className="num p-3 text-right">{tokens(atoms)}</td>
                                                <td className="num p-3 text-right">{valueSol === null ? 'graduated' : `${solNumber(valueSol)} SOL`}</td>
                                                <td className="num p-3 text-right text-muted">{sol(totalBounty(problem))} SOL</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Panel>
                        )}
                        <p className="text-xs text-faint">Value is tokens × the current curve price, before fees and price impact of selling.</p>
                    </section>
                </>
            )}
        </div>
    )
}
