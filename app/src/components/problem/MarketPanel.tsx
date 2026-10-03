import type { ProblemView } from '@/lib/chain'
import { percentDown } from '@/lib/format'
import { ClaimPanel } from './ClaimPanel'
import { SweepBar } from './SweepBar'
import { TradePanel } from './TradePanel'
import { Meter, Panel } from '../ui'

export function MarketPanel({ problem }: { problem: ProblemView }) {
    return (
        <Panel className="space-y-5 rounded-2xl p-5">
            <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Trade</h2>
                <span className="text-xs text-muted">1% fee, most of it to the prize</span>
            </div>
            <Meter
                label="Bonding curve to graduation"
                value={problem.graduated ? 1 : problem.curveProgress}
                detail={problem.graduated ? 'graduated to DAMM v2' : percentDown(problem.curveProgress, 2)}
            />
            <TradePanel problem={problem} />
            <SweepBar problem={problem} />
            <ClaimPanel problem={problem} />
        </Panel>
    )
}
