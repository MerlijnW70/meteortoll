import type { Metadata } from 'next'
import Link from 'next/link'
import { PageIntro, Panel } from '@/components/ui'
import { REPO_URL } from '@/lib/config'
import { ECONOMICS, HAS_TREASURY, LAUNCH_FEE_SOL, LAUNCH_WINDOW_TEXT, TREASURY_SHARE } from '@/lib/economics'

export const metadata: Metadata = { title: 'Terms and risks' }

const UPDATED = '2026-10-02'

function Section({ title, gist, children }: { title: string; gist: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-border pt-5">
            <details className="group">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                    <span>
                        <span className="block text-lg font-semibold tracking-tight">{title}</span>
                        <span className="mt-0.5 block text-sm text-muted">{gist}</span>
                    </span>
                    <span aria-hidden className="mt-1 text-muted transition-transform group-open:rotate-45">
                        +
                    </span>
                </summary>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
            </details>
        </section>
    )
}

export default function Terms() {
    return (
        <div className="mx-auto max-w-3xl space-y-8">
            <PageIntro eyebrow={`Last updated ${UPDATED}`} title="Terms and risks">
                Plain language, because the risks are real. Open a section for the full text.
            </PageIntro>

            <Panel className="border-warn/30 bg-warn/5 p-4 text-sm text-warn">
                Problem tokens can lose all their value. Only trade what you can afford to lose. Nothing on this site is financial, investment, legal or tax advice.
            </Panel>

            <Section title="What this site is" gist="An interface to public Solana programs. It never holds your funds or keys.">
                <p>
                    meteortoll is an interface to public Solana programs: Meteora&apos;s Dynamic Bonding Curve and DAMM v2, and the open-source toll program that holds and pays out
                    prizes. Every trade, commitment and payout is a transaction you sign in your own wallet. The site never holds your funds or your keys, and cannot move them.
                </p>
            </Section>

            <Section title="Risks of trading problem tokens" gist="Prices can fall to near zero, and a token is not a share of its prize.">
                <ul className="list-disc space-y-1 pl-5">
                    <li>A token&apos;s price is set by its bonding curve and, after graduation, by a DAMM v2 pool. It can fall to near zero, and there may be no one to sell to.</li>
                    <li>Buying a token does not give you a share of its prize. The prize goes to the solver, and the token keeps trading after the problem is solved.</li>
                    <li>Every trade pays a fee, and swaps carry a slippage limit; you may receive less than the estimate shown.</li>
                    {LAUNCH_WINDOW_TEXT && (
                        <li>Right after a launch the fee is {LAUNCH_WINDOW_TEXT}. The trade panel shows it before you buy; one-click buys refuse to trade inside it.</li>
                    )}
                    <li>Transactions are final. There are no refunds and no one who can reverse a trade.</li>
                </ul>
            </Section>

            <Section title="Risks of the programs" gist="Not audited by a third party yet; the team can still upgrade the program.">
                <ul className="list-disc space-y-1 pl-5">
                    <li>The toll program has been self-reviewed and tested against the real Meteora programs. It has not had a third-party audit, and it may contain bugs that lose funds.</li>
                    <li>During the hackathon the program&apos;s upgrade authority is held by the team, which means the team could change the program. It will be moved to a multisig or revoked before any public prize is large.</li>
                    <li>Meteora&apos;s programs, Solana itself and the RPC services this site uses can fail, halt or behave unexpectedly.</li>
                </ul>
            </Section>

            <Section title="Risks of solving" gist="A revealed scheme that fails loses its bond; the earliest commitment wins.">
                <ul className="list-disc space-y-1 pl-5">
                    <li>Committing stakes a bond. If your scheme fails the on-chain check, the bond goes to the prize and is not returned.</li>
                    <li>The earliest commitment that holds wins, even if you revealed first. A prize may be small, or may never be claimed.</li>
                    <li>Your commitment&apos;s salt is kept in this browser. If you clear it before revealing, you cannot reveal, and can only abandon the attempt to get the bond back.</li>
                </ul>
            </Section>

            <Section
                title="The team's own interest"
                gist={HAS_TREASURY || LAUNCH_FEE_SOL > 0 ? 'The meteortoll treasury takes a set share of fees; demos are labelled.' : 'Problems our own tool already answers are labelled disclosed demos.'}
            >
                {(HAS_TREASURY || LAUNCH_FEE_SOL > 0) && (
                    <p>
                        The meteortoll treasury takes
                        {HAS_TREASURY && <> {ECONOMICS.treasurySharePercent}% of the trading fee the protocol leaves ({TREASURY_SHARE} of each trade) and the same share of a full curve&apos;s surplus</>}
                        {HAS_TREASURY && LAUNCH_FEE_SOL > 0 && <>, and</>}
                        {LAUNCH_FEE_SOL > 0 && <> {LAUNCH_FEE_SOL} SOL per launch</>}. These are fixed in the launchpad&apos;s on-chain config and cannot be raised later.
                    </p>
                )}
                <p>
                    The team runs fmm, a search tool for matrix multiplication schemes. Any problem whose target fmm already meets is labelled a disclosed demo and is not a public prize. If fmm
                    ever solves a public problem, the team will say so before claiming. See{' '}
                    <Link href="/trust" className="text-accent hover:underline">
                        How it works
                    </Link>
                    .
                </p>
            </Section>

            <Section title="Your responsibility" gist="Whether using this is legal where you are, and your taxes, are on you.">
                <p>
                    You are responsible for whether using this site, and trading these tokens, is legal where you are, and for any taxes. Do not use it where it is not allowed.
                </p>
            </Section>

            <Section title="Privacy" gist="No accounts, no cookies. What you do on-chain is public.">
                <ul className="list-disc space-y-1 pl-5">
                    <li>There are no accounts and no cookies. Page views are counted with Vercel Web Analytics, which sets no cookies and stores no personal data.</li>
                    <li>Your browser stores the salt of each commitment you make, so you can reveal later. It never leaves your browser.</li>
                    <li>The site&apos;s RPC relay uses your IP address, in memory only, to limit how many requests one visitor can send. Our host, Vercel, keeps standard request logs.</li>
                    <li>
                        When something on the site breaks, your browser sends us the error message, the page and the site version, so we can fix it. Nothing that identifies you, and
                        never anything resembling a key.
                    </li>
                    <li>Everything you do on-chain, including your wallet address, is public and permanent. That is how Solana works.</li>
                </ul>
            </Section>

            <Section title="No warranty" gist="Open source under MIT or Apache-2.0, provided as is.">
                <p>
                    The software is open source under{' '}
                    <a href={`${REPO_URL}/blob/main/LICENSE-MIT`} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                        MIT
                    </a>{' '}
                    or{' '}
                    <a href={`${REPO_URL}/blob/main/LICENSE-APACHE`} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                        Apache-2.0
                    </a>
                    , at your option, and is provided as is, without warranty of any kind. Third-party parts are listed in{' '}
                    <a href={`${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                        the notices
                    </a>
                    . Questions and problems:{' '}
                    <a href={`${REPO_URL}/issues`} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                        open an issue on GitHub
                    </a>
                    ; security flaws privately, as{' '}
                    <a href={`${REPO_URL}/blob/main/SECURITY.md`} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                        the security policy
                    </a>{' '}
                    describes.
                </p>
            </Section>
        </div>
    )
}
