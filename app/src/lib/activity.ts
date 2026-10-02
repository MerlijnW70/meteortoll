import type { Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { ProblemView } from './chain'
import { allSignatures, tollCalls, transactionsFor, transferredOut } from './history'
import { withRetry } from './rpc'
import { tradesIn } from './trades'

export type ActivityKind = 'buy' | 'sell' | 'launch' | 'commit' | 'claim' | 'close'

export interface Activity {
    kind: ActivityKind
    signature: string
    time: number | null
    slot: number
    problem: string
    lamports?: bigint
    tokens?: bigint
    fee?: bigint
}

const TOLL_KINDS: Record<string, ActivityKind> = { registerProblem: 'launch', commit: 'commit', claim: 'claim', closeAttempt: 'close' }

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

const PER_TOKEN = 200
const ACCOUNTS_PER_CALL = 100

async function existing(connection: Connection, addresses: PublicKey[]): Promise<PublicKey[]> {
    const found: PublicKey[] = []
    for (let i = 0; i < addresses.length; i += ACCOUNTS_PER_CALL) {
        const page = addresses.slice(i, i + ACCOUNTS_PER_CALL)
        const infos = await withRetry(() => connection.getMultipleAccountsInfo(page, 'confirmed'))
        page.forEach((address, j) => infos[j] && found.push(address))
    }
    return found
}

export async function fetchActivity(connection: Connection, owner: PublicKey, problems: ProblemView[], limit = 300): Promise<Activity[]> {
    const accounts = await existing(
        connection,
        problems.map((p) => getAssociatedTokenAddressSync(p.account.baseMint, owner, true))
    )
    const lists = await Promise.all([allSignatures(connection, owner, limit), ...accounts.map((a) => allSignatures(connection, a, PER_TOKEN))])
    const signatures = [...new Set(lists.flat().filter((s) => !s.err).map((s) => s.signature))]
    const txs = await transactionsFor(connection, signatures)
    return txs.flatMap((tx) => activityIn(tx, owner.toBase58(), problems))
}

export interface CostBasis {
    tokens: bigint
    cost: bigint
    realized: bigint
}

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

export const bountyFunded = (activity: Activity[]) => activity.reduce((sum, a) => sum + (a.fee ?? 0n), 0n)
