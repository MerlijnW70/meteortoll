import type { Metadata } from 'next'
import Link from 'next/link'
import { PageIntro, Panel } from '@/components/ui'
import { REPO_URL } from '@/lib/config'

export const metadata: Metadata = { title: 'Terms and risks' }

const UPDATED = '2026-10-02'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h2 className="font-medium">{title}</h2>
            <div className="space-y-2 text-sm leading-relaxed text-muted">{children}</div>
        </section>
    )
}

export default function Terms() {
    return (
        <div className="mx-auto max-w-3xl space-y-8">
            <PageIntro title="Terms and risks">Plain language, because the risks are real. Last updated {UPDATED}.</PageIntro>

            <Panel className="border-warn/30 bg-warn/5 p-4 text-sm text-warn">
                Problem tokens can lose all their value. Only trade what you can afford to lose. Nothing on this site is financial, investment, legal or tax advice.
            </Panel>

            <Section title="What this site is">
                <p>
                    meteortoll is an interface to public Solana programs: Meteora&apos;s Dynamic Bonding Curve and DAMM v2, and the open-source toll program that holds and pays out
                    bounties. Every trade, commitment and payout is a transaction you sign in your own wallet. The site never holds your funds or your keys, and cannot move them.
                </p>
            </Section>

            <Section title="Risks of trading problem tokens">
                <ul className="list-disc space-y-1 pl-5">
                    <li>A token&apos;s price is set by its bonding curve and, after graduation, by a DAMM v2 pool. It can fall to near zero, and there may be no one to sell to.</li>
                    <li>Buying a token does not give you a share of its bounty. The bounty goes to the solver, and the token keeps trading after the problem is solved.</li>
                    <li>Every trade pays a fee, and swaps carry a slippage limit; you may receive less than the estimate shown.</li>
                    <li>Transactions are final. There are no refunds and no one who can reverse a trade.</li>
                </ul>
            </Section>

            <Section title="Risks of the programs">
                <ul className="list-disc space-y-1 pl-5">
                    <li>The toll program has been self-reviewed and tested against the real Meteora programs. It has not had a third-party audit, and it may contain bugs that lose funds.</li>
                    <li>During the hackathon the program&apos;s upgrade authority is held by the team, which means the team could change the program. It will be moved to a multisig or revoked before any public bounty is large.</li>
                    <li>Meteora&apos;s programs, Solana itself and the RPC services this site uses can fail, halt or behave unexpectedly.</li>
                </ul>
            </Section>

            <Section title="Risks of solving">
                <ul className="list-disc space-y-1 pl-5">
                    <li>Committing stakes a bond. If your scheme fails the on-chain check, the bond goes to the bounty and is not returned.</li>
                    <li>The earliest commitment that holds wins, even if you revealed first. A bounty may be small, or may never be claimed.</li>
                    <li>Your commitment&apos;s salt is kept in this browser. If you clear it before revealing, you cannot reveal, and can only abandon the attempt to get the bond back.</li>
                </ul>
            </Section>

            <Section title="The team's own interest">
                <p>
                    The team runs fmm, a search tool for matrix multiplication schemes. Any problem whose target fmm already meets is labelled a disclosed demo and is not a public bounty. If fmm
                    ever solves a public problem, the team will say so before claiming. See{' '}
                    <Link href="/trust" className="text-accent hover:underline">
                        How it works
                    </Link>
                    .
                </p>
            </Section>

            <Section title="Your responsibility">
                <p>
                    You are responsible for whether using this site, and trading these tokens, is legal where you are, and for any taxes. Do not use it where it is not allowed.
                </p>
            </Section>

            <Section title="Privacy">
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

            <Section title="No warranty">
                <p>
                    The software is open source under MIT or Apache-2.0 and is provided as is, without warranty of any kind. Questions and problems:{' '}
                    <a href={`${REPO_URL}/issues`} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                        open an issue on GitHub
                    </a>
                    .
                </p>
            </Section>
        </div>
    )
}
