import type { Metadata } from 'next'
import { TOLL } from '@meteortoll/core'
import { Strassen } from '@/components/explain/Strassen'
import { PageIntro, Panel } from '@/components/ui'
import { explorer, REPO_URL } from '@/lib/config'

const steps: [string, string][] = [
    ['Launch', 'A problem is launched as a token on Meteora’s Dynamic Bonding Curve. The pool’s creator is the problem’s own address, derived from the pool and the statement, so the statement cannot be swapped later.'],
    ['Trade', 'Every trade pays a 1% fee. Everything the protocol leaves goes to the problem’s bounty vault: curve fees, the creator’s surplus share, and after graduation the fees of a permanently locked DAMM v2 position.'],
    ['Commit', 'A solver posts the hash of their scheme and a bond. Nobody can see the scheme yet.'],
    ['Upload and reveal', 'The scheme is uploaded in chunks and revealed. The program checks the hash, the shape and that the rank is at most the target.'],
    ['Verify', 'Anyone can crank the check. The program evaluates the scheme as a polynomial identity at a random point drawn from a slot hash newer than the commitment. Three random numbers from that hash give every matrix entry its value, which makes the chance a wrong scheme passes provably tiny: at most (n₁n₂ + n₂n₃ + n₃n₁)/2⁶¹, below one in 10¹⁵ for every format here. A failing scheme loses its bond to the bounty.'],
    ['Grace and claim', 'The earliest commitment that holds wins, so copying someone’s upload cannot take the bounty. After the grace window the solver claims the vault, and keeps claiming as fees arrive.'],
]

export const metadata: Metadata = { title: 'How it works' }

export default function Trust() {
    return (
        <div className="mx-auto max-w-3xl space-y-8">
            <PageIntro title="How it works">
                Every rule below is enforced by code you can read and check. There is no committee and no oracle.
            </PageIntro>
            <div id="why">
                <Strassen />
            </div>
            <ol className="space-y-3">
                {steps.map(([title, body], i) => (
                    <li key={title}>
                        <Panel className="flex gap-4 p-5">
                            <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-sm text-accent">{i + 1}</span>
                            <div>
                                <h2 className="font-medium">{title}</h2>
                                <p className="mt-1 text-sm text-muted">{body}</p>
                            </div>
                        </Panel>
                    </li>
                ))}
            </ol>
            <Panel className="space-y-2 p-5 text-sm">
                <h2 className="font-medium">Addresses and status</h2>
                <p>
                    <span className="text-muted">Program · </span>
                    <a className="font-mono hover:underline" href={explorer('address', TOLL.toBase58())} target="_blank" rel="noreferrer">
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
                    Upgrade authority is held by the team during the hackathon and will be moved to a multisig or revoked before any public bounty is large.
                    The program has had a self-review and extensive tests against the real Meteora programs, not a third-party audit.
                </p>
            </Panel>
        </div>
    )
}
