import Link from 'next/link'
import type { ProblemView } from '@/lib/chain'
import type { Checked } from '@/lib/checkFile'
import { Panel, shape } from '../ui'

const verdictStyle = { holds: 'bg-good/15 text-good', fails: 'bg-bad/15 text-bad', malformed: 'bg-bad/15 text-bad', running: 'bg-panel-2 text-muted' }
const verdictLabel = { holds: 'Holds', fails: 'Does not hold', malformed: 'Malformed', running: 'Checking' }

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
    return (
        <Panel className="space-y-4 p-5" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="font-mono text-lg">
                        ⟨{header.n1}×{header.n2}×{header.n3} : {header.rank}⟩
                    </div>
                    <div className="break-all text-xs text-muted">
                        {checked.file} · {checked.bytes.toLocaleString()} bytes encoded
                    </div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${verdictStyle[result.verdict]}`}>{verdictLabel[result.verdict]}</span>
            </div>
            <dl className="num grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                    <dt className="text-xs text-muted">Products</dt>
                    <dd>{result.productsDone}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted">Triples</dt>
                    <dd>{result.triplesDone}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted">Scheme side</dt>
                    <dd className="truncate font-mono text-xs">{result.lhs.toString()}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted">Direct side</dt>
                    <dd className="truncate font-mono text-xs">{result.rhs.toString()}</dd>
                </div>
            </dl>
            <p className="text-xs text-faint">
                Checked at one random point mod 2⁶¹−1 in {checked.millis.toFixed(1)} ms. On-chain the point comes from a slot hash that does not exist until after
                you commit.
            </p>
            {result.verdict === 'holds' && (
                <div className="rounded-lg bg-panel-2 p-4 text-sm">
                    {answers.length > 0 ? (
                        <>
                            <p className="mb-2">This scheme answers:</p>
                            <ul className="space-y-2">
                                {answers.map((p) => (
                                    <li key={p.address} className="flex flex-wrap items-center gap-2">
                                        <Link className="font-mono text-accent hover:underline" href={`/p/${p.address}`}>
                                            ⟨{shape(p).label} : ≤{p.account.targetRank}⟩
                                        </Link>
                                        <span className="text-muted">{p.info.symbol}</span>
                                        <button onClick={() => onSubmit(p.address)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-bg">
                                            Submit to this problem
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : solved ? (
                        <p className="text-muted">
                            It holds. It answers{' '}
                            <Link className="font-mono text-accent hover:underline" href={`/p/${solved.address}`}>
                                ⟨{shape(solved).label} : ≤{solved.account.targetRank}⟩
                            </Link>
                            , which is already solved: see how the program verified it on-chain.
                        </p>
                    ) : (
                        <p className="text-muted">It holds, but no open problem on this launchpad asks for this shape at this rank.</p>
                    )}
                </div>
            )}
        </Panel>
    )
}
