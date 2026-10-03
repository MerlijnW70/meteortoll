import { type Connection, PublicKey } from '@solana/web3.js'
import { fetchProblems, type ProblemView, totalBounty } from './chain'
import { problemStanding } from './classify'
import { CLUSTER } from './config'
import { fetchHistory, type HistoryEvent, paidOut } from './history'
import { CREATOR_PERCENT, toPrize } from './economics'
import { fetchTrades, type Trade } from './trades'

export interface Stats {
    problems: number
    open: number
    solved: number
    bountyLamports: bigint
    paidLamports: bigint
    volumeLamports: bigint
    trades: number
    traders: number
    perProblem: Record<string, ProblemStats>
}

export interface ProblemStats {
    paidLamports: bigint
    volumeLamports: bigint
    prizeLamports: bigint
    trades: number
    traders: number
    lastTrade: number | null
}

export const DAY_SECONDS = 86_400

export function problemStats(trades: Trade[], history: HistoryEvent[], now: number, creatorPercent: number): ProblemStats {
    const recent = trades.filter((t) => t.time !== null && now - t.time < DAY_SECONDS)
    const times = trades.flatMap((t) => (t.time === null ? [] : [t.time]))
    return {
        paidLamports: paidOut(history),
        volumeLamports: recent.reduce((sum, t) => sum + t.quoteLamports, 0n),
        prizeLamports: toPrize(recent.reduce((sum, t) => sum + t.feeLamports, 0n), creatorPercent),
        trades: recent.length,
        traders: new Set(recent.map((t) => t.trader)).size,
        lastTrade: times.length ? Math.max(...times) : null,
    }
}

export interface Activity {
    trades: Trade[]
    history: HistoryEvent[]
}

export function summarize(
    problems: ProblemView[],
    activity: Map<string, Activity>,
    now = Date.now() / 1000,
    creatorPercent = CREATOR_PERCENT,
    mainnet = CLUSTER === 'mainnet'
): Stats {
    const listed = problems.filter((p) => !p.info.hidden)
    const winnable = listed.filter((p) => p.phase === 'open' && p.info.kind !== 'demo' && !problemStanding(p, mainnet))
    const traders = new Set<string>()
    const perProblem: Record<string, ProblemStats> = {}
    let volumeLamports = 0n
    let trades = 0
    let paidLamports = 0n
    for (const p of listed) {
        const a = activity.get(p.address)
        if (!a) continue
        perProblem[p.address] = problemStats(a.trades, a.history, now, creatorPercent)
        for (const t of a.trades) {
            volumeLamports += t.quoteLamports
            traders.add(t.trader)
        }
        trades += a.trades.length
        paidLamports += paidOut(a.history)
    }
    return {
        problems: listed.length,
        open: winnable.length,
        solved: listed.filter((p) => p.phase === 'solved').length,
        bountyLamports: winnable.reduce((sum, p) => sum + totalBounty(p), 0n),
        paidLamports,
        volumeLamports,
        trades,
        traders: traders.size,
        perProblem,
    }
}

const HISTORY_CAP = 5_000

async function activityOf(connection: Connection, problem: ProblemView): Promise<Activity> {
    const [trades, history] = await Promise.all([fetchTrades(connection, problem.account.pool, HISTORY_CAP), fetchHistory(connection, new PublicKey(problem.address), HISTORY_CAP)])
    return { trades, history }
}

export async function collectStats(connection: Connection): Promise<Stats> {
    const problems = (await fetchProblems(connection)).filter((p) => !p.info.hidden)
    const activity = new Map<string, Activity>()
    for (let i = 0; i < problems.length; i += 3) {
        const batch = problems.slice(i, i + 3)
        const results = await Promise.all(batch.map((p) => activityOf(connection, p)))
        batch.forEach((p, j) => activity.set(p.address, results[j]))
    }
    return summarize(problems, activity)
}

type Jsonish<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] }
export type ProblemStatsJson = Jsonish<ProblemStats>
export type StatsJson = Jsonish<Omit<Stats, 'perProblem'>> & { perProblem?: Record<string, ProblemStatsJson> }

const big = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]))

export const toJson = ({ perProblem, ...rest }: Stats): StatsJson =>
    ({ ...big(rest), perProblem: Object.fromEntries(Object.entries(perProblem).map(([k, d]) => [k, big(d)])) }) as StatsJson

export function fromJson(j: StatsJson): Stats {
    return {
        ...j,
        bountyLamports: BigInt(j.bountyLamports),
        paidLamports: BigInt(j.paidLamports),
        volumeLamports: BigInt(j.volumeLamports),
        perProblem: Object.fromEntries(
            Object.entries(j.perProblem ?? {}).map(([k, d]) => [
                k,
                { ...d, paidLamports: BigInt(d.paidLamports), volumeLamports: BigInt(d.volumeLamports), prizeLamports: BigInt(d.prizeLamports) },
            ]),
        ),
    }
}
