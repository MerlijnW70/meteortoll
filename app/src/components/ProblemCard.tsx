import Link from 'next/link'
import { type ProblemView, totalBounty } from '@/lib/chain'
import { cardChip, cardTitle, type ChipTone } from '@/lib/card'
import { CLUSTER } from '@/lib/config'
import { MatrixArt } from './MatrixArt'
import { QuickBuy } from './QuickBuy'
import { sol } from './ui'

export const CHIP_TONE: Record<ChipTone, string> = { good: 'bg-good', accent: 'bg-accent-2', warn: 'bg-warn', muted: 'bg-muted' }

export function ProblemCard({ problem }: { problem: ProblemView }) {
    const chip = cardChip(problem, CLUSTER === 'mainnet')
    const solved = problem.phase === 'solved'
    return (
        <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-panel transition hover:border-accent/50 focus-within:border-accent">
            <Link
                href={`/p/${problem.address}`}
                className="flex flex-col p-2.5 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
                <MatrixArt problem={problem} className="aspect-[16/10] rounded-xl px-3 pb-2 pt-9">
                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-bg/80 px-2.5 py-1 text-xs text-text">
                        <span className={`h-2 w-2 rounded-full ${CHIP_TONE[chip.tone]} ${chip.live ? 'live-dot' : ''}`} />
                        {chip.label}
                    </span>
                    {problem.info.kind === 'demo' && <span className="absolute right-3 top-3 rounded-full bg-bg/60 px-2.5 py-1 text-xs text-muted">Demo</span>}
                </MatrixArt>
                <span className="px-3.5 pt-4 text-2xl font-semibold tracking-tight">
                    {cardTitle(problem.account)}
                </span>
            </Link>
            <div className="pointer-events-none relative z-10 mt-auto flex items-center justify-between gap-4 px-6 pb-6 pt-3">
                <div>
                    <div className="num text-2xl font-semibold tracking-tight">
                        {sol(totalBounty(problem), 3)} <span className="text-base font-medium text-muted">SOL</span>
                    </div>
                    <div className="text-xs text-muted">{solved ? 'prize left' : 'prize'}</div>
                </div>
                <span className="pointer-events-auto">
                    {problem.graduated ? (
                        <span className="text-sm text-muted">On Meteora</span>
                    ) : (
                        <QuickBuy problem={problem} className="num rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50" />
                    )}
                </span>
            </div>
        </article>
    )
}
