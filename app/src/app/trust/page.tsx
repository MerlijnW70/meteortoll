import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PROTOCOL_FEE_PERCENT } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { BOND_LAMPORTS, TOLL } from '@meteortoll/core'
import { Roles } from '@/components/explain/Roles'
import { Strassen } from '@/components/explain/Strassen'
import { PageIntro, Panel } from '@/components/ui'
import { explorer, REPO_URL } from '@/lib/config'

export const metadata: Metadata = { title: 'How it works' }

const BOND_SOL = Number(BOND_LAMPORTS) / 1e9
/// Of the 1% fee, Meteora's protocol keeps its share; the creator's part, all of the rest, is the bounty's.
const BOUNTY_SHARE = `${(1 * (100 - PROTOCOL_FEE_PERCENT)) / 100}%`

const OVERVIEW: [string, string][] = [
    ['A problem becomes a token', 'Each open matrix multiplication problem trades as its own token on a Meteora bonding curve.'],
    ['Trading funds a bounty', `${BOUNTY_SHARE} of every trade goes into the problem's bounty, held by the program, not by a person.`],
    ['A proof gets paid', 'The first scheme the Solana program verifies takes the bounty. No judges, no sign-up.'],
]

const SOURCES: [string, string][] = [
    ['Trading fees on the curve', `Every trade pays 1%. Meteora's protocol keeps ${PROTOCOL_FEE_PERCENT}% of that fee; the rest, ${BOUNTY_SHARE} of the trade, is the bounty's.`],
    ['The surplus at graduation', "When the curve fills, the pool's creator share of what it raised beyond the migration amount goes to the bounty."],
    ['A locked DAMM v2 position', 'After graduation the problem owns a permanently locked liquidity position. Its trading fees keep arriving, forever.'],
    ['Bonds of wrong answers', `Every submission stakes ${BOND_SOL} SOL. A scheme that fails the check loses its bond to the bounty.`],
]

const GUARANTEES: { title: string; plain: string; detail: ReactNode }[] = [
    {
        title: 'Code decides, not people',
        plain: 'A Solana program checks every submission itself. Nobody can approve a wrong answer or block a right one.',
        detail: (
            <>
                The check treats the scheme as a polynomial identity and evaluates it at a random point. Three numbers drawn from a slot hash newer than the
                submission give every matrix entry its value, so a wrong scheme passes with probability at most (n₁n₂ + n₂n₃ + n₃n₁)/2⁶¹: below one in 10¹⁵ for
                every format here. Anyone can send the verify calls; the result does not depend on who does.
            </>
        ),
    },
    {
        title: 'Copying does not pay',
        plain: 'A solver first posts a sealed fingerprint of their answer. Whoever sealed first wins, so watching someone else’s upload gains nothing.',
        detail: (
            <>
                The commitment is a hash of the problem, the solver, a secret salt and the scheme. Reveal checks the upload against it. If two schemes both
                verify, the earlier commitment takes the solve during the grace window.
            </>
        ),
    },
    {
        title: 'Wrong answers cost',
        plain: `Each submission stakes a ${BOND_SOL} SOL bond. A correct scheme gets it back; a wrong one pays it into the bounty.`,
        detail: <>A revealed attempt cannot withdraw before its check ends, so a solver who sees a failure coming cannot pull the bond.</>,
    },
    {
        title: 'The statement is fixed',
        plain: 'The shape and the target are part of the problem’s address. Nobody can change what is being asked after launch.',
        detail: (
            <>
                The problem&apos;s address is derived from its pool and its statement, and it is the pool&apos;s creator on Meteora. Only the program can sign
                for it, which is why only a verified solver can move the bounty.
            </>
        ),
    },
]

const FAQ: [string, ReactNode][] = [
    ['Do I need to understand the math to trade?', 'No. Trading works like any other token. The math matters to solvers; traders back the problems they find interesting and fund the bounty by trading.'],
    ['Can the team take the bounty?', 'No instruction lets anyone but a verified solver move it. During the hackathon the team can still upgrade the program; that authority moves to a multisig or is revoked before any public bounty is large.'],
    ['What if nobody solves it?', 'The bounty stays in the vault and keeps growing with trading. There is no deadline.'],
    ['What if two people solve it?', 'The earlier commitment wins. After the first scheme verifies there is a grace window, shown on each problem page, in which an earlier committed scheme can still take the solve.'],
    ['What does submitting cost?', `The ${BOND_SOL} SOL bond, which comes back if the scheme holds, plus network fees and rent for the upload buffer, which is returned when the attempt closes. The Solve page checks your scheme in the browser first, for free.`],
    ['Who keeps the bounty topped up?', 'Anyone can move fees into the bounty, and a small keeper wallet does it every 30 minutes. It only pays transaction fees and can never receive anything.'],
    ['What is a disclosed demo?', 'A problem the meteortoll team can already answer, launched to show the full loop. It is marked on every page and is not a public bounty.'],
    ['Has it been audited?', 'Not by a third party yet. The program has been reviewed by the team and is tested against the real Meteora programs. Its source is public.'],
]

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: ReactNode; children: ReactNode }) {
    return (
        <section id={id} aria-labelledby={`${id ?? title}-title`} className="space-y-4">
            <div className="space-y-1">
                <h2 id={`${id ?? title}-title`} className="text-xl font-semibold">
                    {title}
                </h2>
                {intro && <p className="max-w-2xl text-muted">{intro}</p>}
            </div>
            {children}
        </section>
    )
}

export default function Trust() {
    return (
        <div className="mx-auto max-w-5xl space-y-14">
            <div className="space-y-6">
                <PageIntro title="How it works">Open math problems, funded by trading, paid out by code. Here is the whole loop, and why you can check every step.</PageIntro>
                <ol className="grid gap-3 md:grid-cols-3">
                    {OVERVIEW.map(([title, body], i) => (
                        <li key={title} className="relative rounded-xl border border-border bg-panel p-5">
                            <span aria-hidden className="num mb-3 grid size-8 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                                {i + 1}
                            </span>
                            <h2 className="font-medium">{title}</h2>
                            <p className="mt-1 text-sm text-muted">{body}</p>
                            {i < OVERVIEW.length - 1 && (
                                <span aria-hidden className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-faint md:block">
                                    →
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            </div>

            <Roles bondSol={BOND_SOL} bountyShare={BOUNTY_SHARE} />

            <div id="why">
                <Strassen />
            </div>

            <Section title="Where the bounty comes from" intro="Four sources feed every problem's bounty. Only a solver whose scheme the program verified can take it out.">
                <ul className="grid gap-3 sm:grid-cols-2">
                    {SOURCES.map(([title, body]) => (
                        <li key={title} className="rounded-xl border border-border bg-panel p-4">
                            <h3 className="font-medium">{title}</h3>
                            <p className="mt-1 text-sm text-muted">{body}</p>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section title="Why you can trust the result" intro="Each rule is enforced by the program. Open a rule for the technical detail.">
                <ul className="grid gap-3 sm:grid-cols-2">
                    {GUARANTEES.map(({ title, plain, detail }) => (
                        <li key={title} className="rounded-xl border border-border bg-panel p-4">
                            <h3 className="font-medium">{title}</h3>
                            <p className="mt-1 text-sm text-muted">{plain}</p>
                            <details className="group mt-3 text-sm">
                                <summary className="cursor-pointer list-none text-accent hover:underline">
                                    <span className="group-open:hidden">Technical detail</span>
                                    <span className="hidden group-open:inline">Hide detail</span>
                                </summary>
                                <p className="mt-2 text-muted">{detail}</p>
                            </details>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section title="Questions">
                <div className="divide-y divide-border rounded-xl border border-border bg-panel">
                    {FAQ.map(([question, answer]) => (
                        <details key={question} className="group px-5 py-4">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                                {question}
                                <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                                    +
                                </span>
                            </summary>
                            <p className="mt-2 text-sm text-muted">{answer}</p>
                        </details>
                    ))}
                </div>
            </Section>

            <Section title="Check it yourself" intro="Everything above runs on public code and public accounts.">
                <Panel className="space-y-2 p-5 text-sm">
                    <p>
                        <span className="text-muted">Program · </span>
                        <a className="break-all font-mono hover:underline" href={explorer('address', TOLL.toBase58())} target="_blank" rel="noreferrer">
                            {TOLL.toBase58()}
                        </a>
                    </p>
                    <p>
                        <span className="text-muted">Source · </span>
                        <a className="hover:underline" href={REPO_URL} target="_blank" rel="noreferrer">
                            {REPO_URL.replace('https://', '')}
                        </a>
                    </p>
                    <p className="text-muted">
                        Upgrade authority is held by the team during the hackathon and will be moved to a multisig or revoked before any public bounty is large. The
                        program has had a self-review and extensive tests against the real Meteora programs, not a third-party audit.
                    </p>
                </Panel>
            </Section>
        </div>
    )
}
