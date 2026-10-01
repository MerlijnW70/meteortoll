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
                Every trade pays a 1% fee. Everything the protocol leaves goes to this problem&apos;s bounty vault, before and after graduation.
            </p>
            <TradePanel problem={problem} />
        </Panel>
    )
}
