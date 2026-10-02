import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { BOND_LAMPORTS, TOLL } from '@meteortoll/core'
import { HowTabs } from '@/components/explain/HowTabs'
import { MoneyFlow } from '@/components/explain/MoneyFlow'
import { RolePaths } from '@/components/explain/RolePaths'
import { BOUNTY_SHARE, LAUNCH_WINDOW_TEXT } from '@/lib/economics'
import { Strassen } from '@/components/explain/Strassen'
import { More, PageIntro, Panel } from '@/components/ui'
import { explorer, REPO_URL } from '@/lib/config'

export const metadata: Metadata = { title: 'How it works' }

const BOND_SOL = Number(BOND_LAMPORTS) / 1e9

const LOOP: [string, string][] = [
    ['An open problem', 'multiply matrices with fewer multiplications'],
    ['becomes a token', 'traded on a Meteora bonding curve'],
    ['trading fills a bounty', `${BOUNTY_SHARE} of every trade`],
    ['a verified answer takes it', 'checked by a Solana program'],
]

const GUARANTEES: { title: string; plain: string; detail: ReactNode }[] = [
    {
        title: 'Code decides, not people',
        plain: 'A Solana program checks every answer. Nobody can approve or block one.',
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
        plain: 'Answers are sealed first; the earliest seal wins.',
        detail: (
            <>
                The commitment is a hash of the problem, the solver, a secret salt and the scheme. Reveal checks the upload against it. If two schemes both
                verify, the earlier commitment takes the solve during the grace window.
            </>
        ),
    },
    {
        title: 'Wrong answers cost',
        plain: `A ${BOND_SOL} SOL bond, lost when a revealed scheme fails.`,
        detail: (
            <>
                A revealed attempt cannot withdraw before its check ends. The bond does not make a wrong scheme pass more often: the random point is public
                once drawn, so a solver can see a failure coming and simply not reveal, and each new slot gives a wrong scheme at most a (n₁n₂ + n₂n₃ +
                n₃n₁)/2⁶¹ chance. What keeps wrong answers out is that bound, not the bond.
            </>
        ),
    },
    {
        title: 'The statement is fixed',
        plain: 'Shape and target are part of the address; nobody can change them.',
        detail: (
            <>
                The problem&apos;s address is derived from its pool and its statement, and it is the pool&apos;s creator on Meteora. Only the program can sign
                for it, which is why only a verified solver can move the bounty.
            </>
        ),
    },
]

const FAQ: [string, ReactNode][] = [
    ...(LAUNCH_WINDOW_TEXT
        ? ([
              [
                  'Why is the fee so high right after a launch?',
                  `To keep bots from sniping new tokens. For the first minutes the fee is ${LAUNCH_WINDOW_TEXT}, and what Meteora does not keep goes to the bounty. The launcher's own first buy pays the normal fee, and the trade panel shows the fee before you buy.`,
              ],
          ] as [string, ReactNode][])
        : []),
    ['Do I need to understand the math to trade?', 'No. Trading works like any other token. The math matters to solvers; traders back the problems they find interesting and fund the bounty by trading.'],
    ['Can the team take the bounty?', 'No instruction lets anyone but a verified solver move it. During the hackathon the team can still upgrade the program; that authority moves to a multisig or is revoked before any public bounty is large.'],
    ['What if nobody solves it?', 'The bounty stays in the vault and keeps growing with trading. There is no deadline.'],
    ['What if two people solve it?', 'The earlier commitment wins. After the first scheme verifies there is a grace window, shown on each problem page, in which an earlier committed scheme can still take the solve.'],
    ['What does submitting cost?', `The ${BOND_SOL} SOL bond, which comes back if the scheme holds, plus network fees and rent for the upload buffer, which is returned when the attempt closes. The Solve page checks your scheme in the browser first, for free.`],
    ['Who keeps the bounty topped up?', 'Anyone can move fees into the bounty, and a small keeper wallet does it every 30 minutes. It only pays transaction fees and can never receive anything.'],
    ['What is a disclosed demo?', 'A problem the meteortoll team can already answer, launched to show the full loop. It is marked on every page and is not a public bounty.'],
    ['Has it been audited?', 'Not by a third party yet. The program has been reviewed by the team and is tested against the real Meteora programs. Its source is public.'],
]

function Trust() {
    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div className="space-y-5">
                <PageIntro title="How it works">Open math problems, funded by trading, paid out by code.</PageIntro>
                <ol aria-label="The loop" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {LOOP.map(([title, body], i) => (
                        <li key={title} className="relative flex items-start gap-2.5 rounded-xl border border-border bg-panel p-3 sm:gap-3 sm:p-4">
                            <span aria-hidden className="num grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent sm:size-7 sm:text-sm">
                                {i + 1}
                            </span>
                            <span>
                                <span className="block text-sm font-medium first-letter:uppercase sm:text-base">{title}</span>
                                <span className="hidden text-xs text-muted sm:block">{body}</span>
                            </span>
                            {i < LOOP.length - 1 && (
                                <span aria-hidden className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 text-faint lg:block">
                                    →
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            </div>

            <HowTabs
                tabs={[
                    { id: 'money', label: 'Where the money goes', content: <MoneyFlow /> },
                    {
                        id: 'trust',
                        label: 'Why you can trust it',
                        content: (
                            <div className="space-y-4">
                                <ul className="grid gap-3 sm:grid-cols-2">
                                    {GUARANTEES.map(({ title, plain, detail }) => (
                                        <li key={title} className="rounded-xl border border-border bg-panel p-4">
                                            <h3 className="font-medium">{title}</h3>
                                            <p className="mt-1 text-sm text-muted">{plain}</p>
                                            <More label="Technical detail" className="mt-3">
                                                <p className="text-sm text-muted">{detail}</p>
                                            </More>
                                        </li>
                                    ))}
                                </ul>
                                <Panel className="space-y-2 p-4 text-sm">
                                    <h3 className="font-medium">Check it yourself</h3>
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
                                    <More label="Upgrade authority and audit">
                                        <p className="text-muted">
                                            Upgrade authority is held by the team during the hackathon and will be moved to a multisig or revoked before any public bounty is
                                            large. The program has had a self-review and extensive tests against the real Meteora programs, not a third-party audit.
                                        </p>
                                    </More>
                                </Panel>
                            </div>
                        ),
                    },
                    { id: 'why', label: 'Why it matters', content: <Strassen /> },
                    { id: 'roles', label: 'Who it is for', content: <RolePaths /> },
                    {
                        id: 'faq',
                        label: 'Questions',
                        content: (
                            <div className="divide-y divide-border rounded-xl border border-border bg-panel">
                                {FAQ.map(([question, answer]) => (
                                    <details key={question} className="group px-5 py-4">
                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                                            {question}
                                            <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                                                +
                                            </span>
                                        </summary>
                                        <p className="mt-2 text-sm text-muted">{answer}</p>
                                    </details>
                                ))}
                            </div>
                        ),
                    },
                ]}
            />
        </div>
    )
}

export default Trust
