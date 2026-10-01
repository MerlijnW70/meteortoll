import type { ProblemView } from '@/lib/chain'
import { explorer } from '@/lib/config'
import { ClaimPanel } from './ClaimPanel'
import { Panel, short } from '../ui'

const SLOT_SECONDS = 0.4

export function Lifecycle({ problem }: { problem: ProblemView }) {
    const { account, phase, slot, graceEndsAtSlot } = problem
    const left = graceEndsAtSlot ? Math.max(0, graceEndsAtSlot - slot) : 0
    const solver = account.solver?.toBase58()
    return (
        <Panel className="p-5">
            <h2 className="mb-3 font-medium">Attempts</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="text-xs text-muted">Commitments made</div>
                    <div className="num text-lg">{account.attempts}</div>
                </div>
                <div>
                    <div className="text-xs text-muted">Solver</div>
                    <div className="font-mono text-lg">
                        {solver ? (
                            <a className="hover:underline" href={explorer('address', solver)} target="_blank" rel="noreferrer">
                                {short(solver)}
                            </a>
                        ) : (
                            '—'
                        )}
                    </div>
                </div>
            </div>
            {phase === 'grace' && (
                <p className="num mt-4 rounded-lg bg-accent-2/10 p-3 text-sm text-accent-2">
                    A scheme of rank {account.solvedRank} holds. Claims open in {left} slots (~{Math.ceil((left * SLOT_SECONDS) / 60)} min) unless an earlier
                    commitment also holds.
                </p>
            )}
            {phase === 'solved' && (
                <p className="mt-4 rounded-lg bg-good/10 p-3 text-sm text-good">
                    Solved with a scheme of rank {account.solvedRank}, verified on-chain. The solver keeps claiming this token&apos;s fees.
                </p>
            )}
            <ClaimPanel problem={problem} />
        </Panel>
    )
}
