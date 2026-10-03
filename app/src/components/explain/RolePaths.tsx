import Link from 'next/link'
import { BOND_LAMPORTS } from '@meteortoll/core'
import { BOUNTY_SHARE, HAS_TREASURY, PROTOCOL_SHARE, TREASURY_SHARE } from '@/lib/economics'
import { BUTTON_QUIET, More } from '../ui'

const BOND_SOL = Number(BOND_LAMPORTS) / 1e9

interface Role {
    key: 'trade' | 'solve' | 'launch'
    audience: string
    title: string
    who: string
    gets: string[]
    cta: [string, string]
    does: string
    why: string[]
    note?: React.ReactNode
    steps: [string, string][]
    tone: string
}

const ROLES: Role[] = [
    {
        key: 'trade',
        audience: 'Traders',
        title: 'I want to trade',
        who: 'You trade on Solana.',
        gets: ['Every token is a real open problem', `${BOUNTY_SHARE} of each trade funds its prize`, 'Graduates to a Meteora DAMM v2 pool'],
        cta: ['/#problems', 'Browse problems'],
        does: 'Buy and sell the token of an open problem on its Meteora bonding curve, from any Solana wallet.',
        why: [
            'Each card shows the problem, the record to beat and the bounty.',
            `Every trade pays a 1% fee: ${PROTOCOL_SHARE} of the trade to Meteora${HAS_TREASURY ? `, ${TREASURY_SHARE} to the meteortoll treasury` : ''} and ${BOUNTY_SHARE} to the bounty.`,
            'When the curve fills, the token moves to Meteora DAMM v2 and its fees keep funding the bounty.',
        ],
        note: (
            <>
                Tokens can lose all their value.{' '}
                <Link href="/terms" className="underline hover:text-muted">
                    Terms and risks
                </Link>
            </>
        ),
        steps: [
            ['Pick a problem', 'Its card shows the bounty, the record to beat and how far the curve has filled.'],
            ['Buy or sell', `Every trade pays a 1% fee; ${BOUNTY_SHARE} of the trade goes to the bounty.`],
            ['Watch it graduate', 'A full curve moves to Meteora DAMM v2; its fees keep funding the bounty.'],
        ],
        tone: 'text-accent-2',
    },
    {
        key: 'solve',
        audience: 'Solvers',
        title: 'I want to solve & claim',
        who: 'Mathematicians, AI researchers, programmers.',
        gets: ['Win the whole prize', 'No judges: the program decides', 'Fees that arrive later are also claimable'],
        cta: ['/solve', 'Open the solver'],
        does: 'Find a scheme with fewer multiplications than the record, check it free in your browser, and submit it.',
        why: [
            'The program pays the bounty to your wallet: no committee, no application.',
            'The earliest commitment whose scheme verifies wins, so a copy cannot.',
            'Fees that arrive after your solve are also claimable.',
        ],
        note: `Final once the grace window ends and no revealed attempt is still being checked. A ${BOND_SOL} SOL bond comes back unless your revealed scheme fails.`,
        steps: [
            ['Check it for free', 'Drop the scheme file on the Solve page; your browser runs the program’s own verifier.'],
            ['Submit', 'Commit, upload, reveal and verify, guided step by step.'],
            ['Claim', 'Once the solve is final, claim the bounty and any fee that arrives later.'],
        ],
        tone: 'text-good',
    },
    {
        key: 'launch',
        audience: 'Creators',
        title: 'I want to launch a problem',
        who: 'Labs, universities, AI companies, startups.',
        gets: ['The sharpest solvers on your problem', 'Traders fund the prize', 'Every answer checked on-chain'],
        cta: ['/launch', 'Launch a problem'],
        does: 'Pick a matrix multiplication format and a target, and launch its token and bounty in one wallet approval.',
        why: [
            'Anyone in the world can work on it, without you hiring a team.',
            'Trading fills the bounty, so you do not have to.',
            'The program checks every answer, so nobody has to review submissions.',
        ],
        note: 'Today: matrix multiplication formats with a published record. The cost is shown exactly before you sign.',
        steps: [
            ['Choose a format', 'A shape with a published record; the target is usually one below it.'],
            ['Launch', 'One approval creates the token, its bonding curve and the problem, with an optional first buy of up to 1 SOL.'],
            ['Share it', 'The bounty grows with trading. The problem belongs to whoever solves it.'],
        ],
        tone: 'text-accent',
    },
]

export function RolePaths() {
    return (
        <section aria-labelledby="roles-title" className="space-y-6">
            <h2 id="roles-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                What do you want to do?
            </h2>
            <ul className="grid gap-10 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border">
                {ROLES.map((role) => (
                    <li key={role.key} id={`role-${role.key}`} className="flex flex-col lg:px-8 lg:first:pl-0 lg:last:pr-0">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${role.tone}`}>{role.audience}</p>
                        <h3 className="mt-1 text-2xl font-semibold tracking-tight">{role.title}</h3>
                        <p className="mt-1 text-sm text-muted">{role.who}</p>
                        <ul className="mt-4 space-y-2 text-sm font-medium">
                            {role.gets.map((line) => (
                                <li key={line} className="flex gap-2">
                                    <span aria-hidden className={role.tone}>
                                        ✓
                                    </span>
                                    <span>{line}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-auto flex flex-wrap items-start gap-x-4 gap-y-3 pt-5">
                            <Link href={role.cta[0]} className={BUTTON_QUIET}>
                                {role.cta[1]}
                            </Link>
                            <More className="w-full text-sm">
                                <div className="space-y-3">
                                    <p>{role.does}</p>
                                    <ul className="list-disc space-y-1 pl-5 text-muted">
                                        {role.why.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                    <ol className="space-y-1.5">
                                        {role.steps.map(([title, body], i) => (
                                            <li key={title} className="flex gap-2">
                                                <span className="num text-xs font-semibold text-muted">{i + 1}</span>
                                                <span>
                                                    <span className="font-medium">{title}.</span> <span className="text-muted">{body}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                    {role.note && <p className="text-xs text-faint">{role.note}</p>}
                                </div>
                            </More>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    )
}
