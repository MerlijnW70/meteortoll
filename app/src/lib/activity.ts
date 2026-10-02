// One wallet's activity on this launchpad, read from its own transactions: its trades on every
// problem's curve, its launches, commitments and claims. From the trades come what each
// position cost and what the wallet's trading paid into bounties.

import type { Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js'
import type { ProblemView } from './chain'
import { fetchTransactions, tollCalls, transferredOut } from './history'
import { tradesIn } from './trades'

export type ActivityKind = 'buy' | 'sell' | 'launch' | 'commit' | 'claim' | 'close'

export interface Activity {
    kind: ActivityKind
    signature: string
    time: number | null
    slot: number
    problem: string
    /// SOL in or out: spent on a buy, received from a sell or a claim.
    lamports?: bigint
    /// Problem tokens bought or sold, in base units.
    tokens?: bigint
    /// The trading fee, which goes to the problem's bounty.
    fee?: bigint
}

const TOLL_KINDS: Record<string, ActivityKind> = { registerProblem: 'launch', commit: 'commit', claim: 'claim', closeAttempt: 'close' }

/// What `owner` did in one transaction, on the problems in `problems`.
export function activityIn(tx: VersionedTransactionResponse, owner: string, problems: ProblemView[]): Activity[] {
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
    const keyList = keys.keySegments().flat().map((k) => k.toBase58())
    if (keyList[0] !== owner) return []
    const base = { signature: tx.transaction.signatures[0], time: tx.blockTime ?? null, slot: tx.slot }
    const found: Activity[] = []
    for (const problem of problems) {
        if (!keyList.includes(problem.account.pool.toBase58())) continue
        for (const trade of tradesIn(tx, problem.account.pool)) {
            found.push({ ...base, kind: trade.side, problem: problem.address, lamports: trade.quoteLamports, tokens: trade.baseAmount, fee: trade.feeLamports })
        }
    }
    const known = new Set(problems.map((p) => p.address))
    for (const call of tollCalls(tx)) {
        const kind = TOLL_KINDS[call.name]
        const problem = call.accounts.problem
        if (!kind || !known.has(problem)) continue
        const lamports = kind === 'claim' ? transferredOut(keyList, tx.meta?.innerInstructions, call.index, call.accounts.quote_vault) : undefined
        found.push({ ...base, kind, problem, lamports })
    }
    return found
}

/// The wallet's latest activity, oldest first, from up to `limit` of its transactions.
export async function fetchActivity(connection: Connection, owner: PublicKey, problems: ProblemView[], limit = 300): Promise<Activity[]> {
    const txs = await fetchTransactions(connection, owner, limit)
    return txs.flatMap((tx) => activityIn(tx, owner.toBase58(), problems))
}

export interface CostBasis {
    /// Tokens the trades account for.
    tokens: bigint
    /// What those tokens cost, fees included, at the average price paid.
    cost: bigint
    /// Profit taken by selling: proceeds minus the average cost of what was sold.
    realized: bigint
}

/// Average-cost accounting over one problem's trades, oldest first. A sale beyond what the trades
/// bought (tokens that arrived by transfer) is costed at zero for the excess.
export function costBasis(trades: Pick<Activity, 'kind' | 'lamports' | 'tokens'>[]): CostBasis {
    let tokens = 0n
    let cost = 0n
    let realized = 0n
    for (const trade of trades) {
        const amount = trade.tokens ?? 0n
        const lamports = trade.lamports ?? 0n
        if (trade.kind === 'buy') {
            tokens += amount
            cost += lamports
        } else if (trade.kind === 'sell' && amount > 0n) {
            const covered = amount < tokens ? amount : tokens
            const costOut = tokens > 0n ? (cost * covered) / tokens : 0n
            tokens -= covered
            cost -= costOut
            realized += lamports - costOut
        }
    }
    return { tokens, cost, realized }
}

/// What the wallet's trades paid into bounties, all problems together.
export const bountyFunded = (activity: Activity[]) => activity.reduce((sum, a) => sum + (a.fee ?? 0n), 0n)
