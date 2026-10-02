'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Role {
    key: string
    label: string
    steps: [string, string][]
    cta: [string, string]
}

/// What each kind of visitor does here, in their own few steps.
export function Roles({ bondSol, bountyShare }: { bondSol: number; bountyShare: string }) {
    const roles: Role[] = [
        {
            key: 'trade',
            label: 'Trade',
            steps: [
                ['Pick a problem', 'Each open problem has its own token on a Meteora bonding curve. The card shows its bounty, the record to beat and how far the curve has filled.'],
                ['Buy or sell', `Trade from the problem page with any Solana wallet. Every trade pays a 1% fee and ${bountyShare} of the trade goes straight to the bounty.`],
                ['Watch it graduate', 'When the curve fills, the pool moves to Meteora DAMM v2 and keeps trading there. Its fees keep funding the bounty.'],
            ],
            cta: ['/', 'Browse problems'],
        },
        {
            key: 'solve',
            label: 'Solve',
            steps: [
                ['Find a scheme', 'Find a way to multiply the matrices with at most the target number of multiplications, by search, by hand or with your own software.'],
                ['Check it for free', 'Drop the scheme file on the Solve page. Your browser runs the same check as the program, so you know the verdict before spending anything.'],
                ['Submit', `The page guides you through commit, upload, reveal and verify. You stake a ${bondSol} SOL bond, which comes back unless the scheme fails.`],
                ['Claim', 'After a short grace window, the bounty is yours to claim, along with every fee that arrives afterwards.'],
            ],
            cta: ['/solve', 'Open the solver'],
        },
        {
            key: 'launch',
            label: 'Launch',
            steps: [
                ['Choose a format', 'Pick a matrix shape with a published record and set the target, usually one below the record.'],
                ['Launch', 'One wallet approval creates the token, its bonding curve and the problem. The total cost is shown, exactly, before you sign.'],
                ['Share it', 'The bounty grows with trading. You hold no special rights afterwards: the problem belongs to whoever solves it.'],
            ],
            cta: ['/launch', 'Launch a problem'],
        },
    ]
    const [active, setActive] = useState(roles[0].key)
    const role = roles.find((r) => r.key === active)!
    return (
        <section aria-labelledby="roles-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="roles-title" className="text-xl font-semibold">
                    What you can do
                </h2>
                <div role="tablist" aria-label="Roles" className="inline-grid grid-cols-3 rounded-lg bg-panel-2 p-1 text-sm">
                    {roles.map((r) => (
                        <button
                            key={r.key}
                            role="tab"
                            id={`tab-${r.key}`}
                            aria-selected={active === r.key}
                            aria-controls="role-panel"
                            onClick={() => setActive(r.key)}
                            className={`rounded-md px-4 py-1.5 ${active === r.key ? 'bg-accent/25 text-text' : 'text-muted hover:text-text'}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>
            <div id="role-panel" role="tabpanel" aria-labelledby={`tab-${role.key}`} className="space-y-4">
                <ol className={`grid gap-3 ${role.steps.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
                    {role.steps.map(([title, body], i) => (
                        <li key={title} className="rounded-xl border border-border bg-panel p-4">
                            <span className="num text-xs font-semibold text-accent">Step {i + 1}</span>
                            <h3 className="mt-1 font-medium">{title}</h3>
                            <p className="mt-1 text-sm text-muted">{body}</p>
                        </li>
                    ))}
                </ol>
                <Link href={role.cta[0]} className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
                    {role.cta[1]}
                </Link>
            </div>
        </section>
    )
}
