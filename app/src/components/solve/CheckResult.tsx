import Link from 'next/link'
import { type ProblemView, totalBounty } from '@/lib/chain'
import type { Checked } from '@/lib/checkFile'
import { count } from '@/lib/format'
import { Panel, shape, sol } from '../ui'

const tone = { holds: 'border-good/40', fails: 'border-bad/40', malformed: 'border-bad/40', running: 'border-border' }
const badge = { holds: 'bg-good/15 text-good', fails: 'bg-bad/15 text-bad', malformed: 'bg-bad/15 text-bad', running: 'bg-panel-2 text-muted' }
const label = { holds: '✓ Holds', fails: '✕ Does not hold', malformed: '✕ Malformed', running: 'Checking…' }

/// What the free check says, in the order a solver asks: is it right, what can it win, then the numbers.
export function CheckResult({
    checked,
    answers,
    solved,
    onSubmit,
}: {
    checked: Checked
    answers: ProblemView[]
    solved?: ProblemView
    onSubmit: (address: string) => void
}) {
    const { header, result } = checked
    const verdict = result.verdict
    return (
        <Panel className={`space-y-4 p-5 ${tone[verdict]}`} aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-mono text-xl">
                        ⟨{header.n1}×{header.n2}×{header.n3} : {header.rank}⟩
                    </div>
                    <div className="break-all text-xs text-muted">{checked.file}</div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${badge[verdict]}`}>{label[verdict]}</span>
            </div>

            {verdict === 'holds' && answers.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm">
                        It computes the {header.n1}×{header.n2}×{header.n3} product with {header.rank} multiplications. It answers:
                    </p>
                    <ul className="space-y-2">
                        {answers.map((p) => (
                            <li key={p.address} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-panel-2 p-3">
                                <span>
                                    <Link className="font-mono hover:underline" href={`/p/${p.address}`}>
                                        ⟨{shape(p).label} : ≤{p.account.targetRank}⟩
                                    </Link>{' '}
                                    <span className="text-xs text-muted">{p.info.symbol}</span>
                                    <span className="num block text-sm text-good">{sol(totalBounty(p))} SOL bounty</span>
                                </span>
                                <button onClick={() => onSubmit(p.address)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
                                    Submit for this bounty
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {verdict === 'holds' && answers.length === 0 && (
                <p className="text-sm text-muted">
                    {solved ? (
                        <>
                            It answers{' '}
                            <Link className="font-mono text-accent hover:underline" href={`/p/${solved.address}`}>
                                ⟨{shape(solved).label} : ≤{solved.account.targetRank}⟩
                            </Link>
                            , which is already solved: see how the program verified it on-chain.
                        </>
                    ) : (
                        <>
                            It is correct, but no open problem asks for {header.n1}×{header.n2}×{header.n3} at rank {header.rank} or more. If it beats the
                            record for its shape, anyone can{' '}
                            <Link href="/launch" className="text-accent hover:underline">
                                launch that problem
                            </Link>
                            .
                        </>
                    )}
                </p>
            )}
            {verdict === 'fails' && (
                <p className="text-sm text-muted">
                    The scheme does not compute the product. Submitting it would lose the bond, so it is not offered. Check the index layout under Scheme format:
                    the third factor is C transposed.
                </p>
            )}
            {verdict === 'malformed' && <p className="text-sm text-muted">The file decodes, but the scheme inside is not well formed: an index or count is out of range.</p>}

            <details className="group text-xs text-muted">
                <summary className="cursor-pointer list-none hover:text-text">
                    <span className="group-open:hidden">Check details</span>
                    <span className="hidden group-open:inline">Hide details</span>
                </summary>
                <dl className="num mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                        <dt>Products</dt>
                        <dd className="text-text">{result.productsDone}</dd>
                    </div>
                    <div>
                        <dt>Encoded size</dt>
                        <dd className="text-text">{count(checked.bytes)} bytes</dd>
                    </div>
                    <div>
                        <dt>Scheme side</dt>
                        <dd className="truncate font-mono text-text">{result.lhs.toString()}</dd>
                    </div>
                    <div>
                        <dt>Direct side</dt>
                        <dd className="truncate font-mono text-text">{result.rhs.toString()}</dd>
                    </div>
                </dl>
                <p className="mt-3">
                    Checked at one random point mod 2⁶¹−1 in {checked.millis.toFixed(1)} ms, with the verifier the Solana program runs. On-chain the point comes from
                    a slot hash that does not exist until after you commit.
                </p>
            </details>
        </Panel>
    )
}
