import { type Connection, PublicKey } from '@solana/web3.js'
import { fetchProblems, type ProblemView, totalBounty } from './chain'
import { fetchHistory, fetchTransactions, type HistoryEvent, paidOut } from './history'
import { type Trade, tradesIn } from './trades'

export interface Stats {
    problems: number
    open: number
    solved: number
    bountyLamports: bigint
    paidLamports: bigint
    volumeLamports: bigint
    trades: number
    traders: number
}

export interface Activity {
    trades: Trade[]
    history: HistoryEvent[]
}

export function summarize(problems: ProblemView[], activity: Map<string, Activity>): Stats {
    const listed = problems.filter((p) => !p.info.hidden)
    const traders = new Set<string>()
    let volumeLamports = 0n
    let trades = 0
    let paidLamports = 0n
    for (const p of listed) {
        const a = activity.get(p.address)
        if (!a) continue
        for (const t of a.trades) {
            volumeLamports += t.quoteLamports
            traders.add(t.trader)
        }
        trades += a.trades.length
        paidLamports += paidOut(a.history)
    }
    return {
        problems: listed.length,
        open: listed.filter((p) => p.phase === 'open').length,
        solved: listed.filter((p) => p.phase === 'solved').length,
        bountyLamports: listed.filter((p) => p.phase === 'open').reduce((sum, p) => sum + totalBounty(p), 0n),
        paidLamports,
        volumeLamports,
        trades,
        traders: traders.size,
    }
}

const POOL_HISTORY_CAP = 5_000

async function activityOf(connection: Connection, problem: ProblemView): Promise<Activity> {
    const pool = problem.account.pool
    const [txs, history] = await Promise.all([fetchTransactions(connection, pool, POOL_HISTORY_CAP), fetchHistory(connection, new PublicKey(problem.address))])
    return { trades: txs.flatMap((tx) => tradesIn(tx, pool)), history }
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

export type StatsJson = { [K in keyof Stats]: Stats[K] extends bigint ? string : Stats[K] }

export const toJson = (s: Stats): StatsJson => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])) as StatsJson

export function fromJson(j: StatsJson): Stats {
    return {
        ...j,
        bountyLamports: BigInt(j.bountyLamports),
        paidLamports: BigInt(j.paidLamports),
        volumeLamports: BigInt(j.volumeLamports),
    }
}
