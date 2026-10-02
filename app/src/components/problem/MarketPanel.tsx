import type { ProblemView } from '@/lib/chain'
import { percentDown } from '@/lib/format'
import { TradePanel } from './TradePanel'
import { Meter, Panel } from '../ui'

export function MarketPanel({ problem }: { problem: ProblemView }) {
    return (
        <Panel className="space-y-5 p-5">
            <h2 className="font-medium">Market</h2>
            <Meter
                label="Bonding curve to graduation"
                value={problem.graduated ? 1 : problem.curveProgress}
                detail={problem.graduated ? 'graduated to DAMM v2' : percentDown(problem.curveProgress, 2)}
            />
            <p className="text-sm text-muted">
                1% fee per trade; most of it goes to the bounty.
            </p>
            <TradePanel problem={problem} />
        </Panel>
    )
}
