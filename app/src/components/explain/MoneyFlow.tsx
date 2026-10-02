import { BOND_LAMPORTS } from '@meteortoll/core'
import { ECONOMICS, HAS_TREASURY, LAUNCH_FEE_SOL, LAUNCH_WINDOW, LAUNCH_WINDOW_TEXT, SPLIT } from '@/lib/economics'
import { More } from '../ui'

const BOND_SOL = Number(BOND_LAMPORTS) / 1e9
const FEE = 0.01
const PROTOCOL = SPLIT.protocol / 100
const TREASURY = SPLIT.treasury / 100
const TO_BOUNTY = SPLIT.bounty / 100
const fmt = (sol: number) => sol.toLocaleString('en-US', { maximumFractionDigits: 4 })

function Node({ title, value, tone = 'text-text', children }: { title: string; value?: string; tone?: string; children?: React.ReactNode }) {
    return (
        <div className="flex-1 rounded-xl border border-border bg-panel p-4">
            <div className="text-xs text-muted">{title}</div>
            {value && <div className={`num mt-0.5 text-xl font-semibold ${tone}`}>{value}</div>}
            {children && <div className="mt-1 text-xs text-muted">{children}</div>}
        </div>
    )
}

function Arrow() {
    return (
        <div aria-hidden className="grid place-items-center text-xl text-faint md:px-1">
            <span className="md:hidden">↓</span>
            <span className="hidden md:inline">→</span>
        </div>
    )
}

export function MoneyFlow() {
    return (
        <div className="space-y-5">
            <figure aria-label="Where one trade's fee goes" className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
                    <Node title="Someone trades" value="1 SOL">
                        buys or sells a problem&apos;s token
                    </Node>
                    <Arrow />
                    <Node title="1% trading fee" value={`${fmt(FEE)} SOL`}>
                        {fmt(PROTOCOL)} SOL to Meteora&apos;s protocol
                        {HAS_TREASURY && <>, {fmt(TREASURY)} SOL to the meteortoll treasury</>}
                    </Node>
                    <Arrow />
                    <Node title="The problem's bounty" value={`+${fmt(TO_BOUNTY)} SOL`} tone="text-good">
                        held by the program, not a person
                    </Node>
                    <Arrow />
                    <Node title="Paid to" value="The first solver" tone="text-accent">
                        whose scheme the program verifies
                    </Node>
                </div>
            </figure>

            <div className="rounded-xl border border-dashed border-border p-4">
                <p className="mb-3 text-sm font-medium">The bounty also grows from</p>
                <ul className={`grid gap-2 sm:grid-cols-2 ${LAUNCH_WINDOW ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                    {LAUNCH_WINDOW && (
                        <li className="rounded-lg bg-panel-2 p-3 text-sm">
                            <span className="font-medium">Launch window</span>
                            <span className="block text-xs text-muted">bots pay up to {LAUNCH_WINDOW.startingFeeBps / 100}% in the first minutes</span>
                        </li>
                    )}
                    <li className="rounded-lg bg-panel-2 p-3 text-sm">
                        <span className="font-medium">Graduation surplus</span>
                        <span className="block text-xs text-muted">when the curve fills</span>
                    </li>
                    <li className="rounded-lg bg-panel-2 p-3 text-sm">
                        <span className="font-medium">Locked DAMM v2 position</span>
                        <span className="block text-xs text-muted">its fees, forever</span>
                    </li>
                    <li className="rounded-lg bg-panel-2 p-3 text-sm">
                        <span className="font-medium">Failed bonds</span>
                        <span className="block text-xs text-muted">{BOND_SOL} SOL per wrong answer</span>
                    </li>
                </ul>
            </div>

            <p className="text-sm">
                <span className="font-medium">Nobody else can take it out</span>
                <span className="text-muted">: not the team, not the launcher. Only a solver whose scheme the program verified.</span>
            </p>
            {(HAS_TREASURY || LAUNCH_FEE_SOL > 0) && (
                <p className="text-sm text-muted">
                    The meteortoll treasury takes
                    {HAS_TREASURY && <> {ECONOMICS.treasurySharePercent}% of what the protocol leaves of each fee, and as much of a full curve&apos;s surplus</>}
                    {HAS_TREASURY && LAUNCH_FEE_SOL > 0 && <>, and</>}
                    {LAUNCH_FEE_SOL > 0 && <> a {LAUNCH_FEE_SOL} SOL fee per launch</>}. It is set in the launchpad&apos;s config on-chain and cannot change.
                </p>
            )}

            <More label="How each source works">
                <dl className="space-y-2 text-sm">
                    <div>
                        <dt className="inline font-medium">Trading fees. </dt>
                        <dd className="inline text-muted">
                            Every trade on the bonding curve pays 1%. Meteora&apos;s protocol keeps its share of that fee
                            {HAS_TREASURY ? `, the meteortoll treasury ${ECONOMICS.treasurySharePercent}% of the rest,` : ''} and the rest is the bounty&apos;s. Anyone can sweep it
                            into the bounty, and a keeper does every 30 minutes.
                        </dd>
                    </div>
                    {LAUNCH_WINDOW && (
                        <div>
                            <dt className="inline font-medium">Launch window. </dt>
                            <dd className="inline text-muted">
                                Right after a launch the fee is {LAUNCH_WINDOW_TEXT}, so bots that buy in the first seconds pay most of their fee into the bounty.
                                The launcher&apos;s own first buy, made in the same transaction as the pool, pays the normal fee.
                            </dd>
                        </div>
                    )}
                    <div>
                        <dt className="inline font-medium">Graduation surplus. </dt>
                        <dd className="inline text-muted">When the curve fills, the pool creator&apos;s share of what it raised beyond the migration amount goes to the bounty.</dd>
                    </div>
                    <div>
                        <dt className="inline font-medium">Locked DAMM v2 position. </dt>
                        <dd className="inline text-muted">After graduation the problem owns a permanently locked liquidity position; its trading fees keep arriving.</dd>
                    </div>
                    <div>
                        <dt className="inline font-medium">Failed bonds. </dt>
                        <dd className="inline text-muted">Every submission stakes {BOND_SOL} SOL. A revealed scheme that fails the check loses its bond to the bounty.</dd>
                    </div>
                </dl>
            </More>
        </div>
    )
}
