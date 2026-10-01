// What happened to a problem, read from the transactions that touched its account: launch,
// commitments, reveals, verdicts and claims. Closed attempts disappear from account lists, but
// their transactions stay, so this history survives them.

import { BorshCoder, type Idl } from '@coral-xyz/anchor'
import type { Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js'
import { commitment, TOLL, tollIdl } from '@meteortoll/core'
import { withRetry } from './rpc'

const coder = new BorshCoder(tollIdl as Idl)
const instructionAccounts: Record<string, string[]> = Object.fromEntries(
    (tollIdl as unknown as { instructions: { name: string; accounts: { name: string }[] }[] }).instructions.map((ix) => [
        camel(ix.name),
        ix.accounts.map((a) => a.name),
    ])
)

function camel(name: string) {
    return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

export type EventKind = 'register' | 'commit' | 'reveal' | 'verify' | 'solved' | 'failed' | 'claim' | 'close' | 'sweep'

export interface HistoryEvent {
    kind: EventKind
    signature: string
    slot: number
    time: number | null
    actor: string
    detail?: string
}

export interface DecodedCall {
    name: string
    data: Record<string, unknown>
    accounts: Record<string, string>
}

const BATCH = 40

export async function fetchTransactions(connection: Connection, address: PublicKey, limit = 200): Promise<VersionedTransactionResponse[]> {
    const signatures = await withRetry(() => connection.getSignaturesForAddress(address, { limit }, 'confirmed'))
    const ok = signatures.filter((s) => !s.err).map((s) => s.signature)
    const out: VersionedTransactionResponse[] = []
    for (let i = 0; i < ok.length; i += BATCH) {
        const page = await withRetry(() =>
            connection.getTransactions(ok.slice(i, i + BATCH), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
        )
        for (const tx of page) if (tx) out.push(tx)
    }
    return out.sort((a, b) => a.slot - b.slot)
}

/// The toll instructions a transaction ran at the top level, with their accounts by name.
export function tollCalls(tx: VersionedTransactionResponse): DecodedCall[] {
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
    const calls: DecodedCall[] = []
    for (const ix of tx.transaction.message.compiledInstructions) {
        if (!keys.get(ix.programIdIndex)?.equals(TOLL)) continue
        const decoded = coder.instruction.decode(Buffer.from(ix.data))
        if (!decoded) continue
        const names = instructionAccounts[decoded.name] ?? instructionAccounts[camel(decoded.name)] ?? []
        const accounts: Record<string, string> = {}
        ix.accountKeyIndexes.forEach((index, i) => {
            if (names[i]) accounts[names[i]] = keys.get(index)?.toBase58() ?? ''
        })
        calls.push({ name: camel(decoded.name), data: decoded.data as Record<string, unknown>, accounts })
    }
    return calls
}

function programEvents(tx: VersionedTransactionResponse) {
    const found: { name: string; data: Record<string, unknown> }[] = []
    for (const line of tx.meta?.logMessages ?? []) {
        if (!line.startsWith('Program data: ')) continue
        const event = coder.events.decode(line.slice('Program data: '.length))
        if (event) found.push({ name: event.name, data: event.data as Record<string, unknown> })
    }
    return found
}

export async function fetchHistory(connection: Connection, problem: PublicKey): Promise<HistoryEvent[]> {
    const txs = await fetchTransactions(connection, problem)
    const events: HistoryEvent[] = []
    for (const tx of txs) {
        const base = { signature: tx.transaction.signatures[0], slot: tx.slot, time: tx.blockTime ?? null }
        const payer = tx.transaction.message.getAccountKeys().get(0)?.toBase58() ?? ''
        for (const call of tollCalls(tx)) {
            const kinds: Record<string, EventKind> = {
                registerProblem: 'register',
                commit: 'commit',
                reveal: 'reveal',
                verify: 'verify',
                claim: 'claim',
                closeAttempt: 'close',
                sweepTradingFees: 'sweep',
                sweepSurplus: 'sweep',
                sweepPositionFees: 'sweep',
            }
            const kind = kinds[call.name]
            if (kind) events.push({ ...base, kind, actor: call.accounts.solver ?? call.accounts.cranker ?? payer })
        }
        for (const event of programEvents(tx)) {
            if (event.name === 'Solved' || event.name === 'solved') {
                events.push({ ...base, kind: 'solved', actor: String(event.data.solver), detail: `rank ${String(event.data.rank)}` })
            }
            if (event.name === 'Failed' || event.name === 'failed') events.push({ ...base, kind: 'failed', actor: String(event.data.solver) })
        }
    }
    // Verify cranks repeat; keep the verdicts and the first crank of each attempt run.
    return events.filter((e, i) => e.kind !== 'verify' || !events.slice(0, i).some((p) => p.kind === 'verify' && p.actor === e.actor))
}

export interface RecoveredScheme {
    scheme: Uint8Array
    submission: string
    attempt: string
    solver: string
    matchesCommitment: boolean
}

/// Rebuilds a solver's scheme from their upload transactions, and checks it against the
/// commitment they staked, using the salt from their reveal.
export async function recoverScheme(connection: Connection, problem: PublicKey, solver: string): Promise<RecoveredScheme | null> {
    const problemTxs = await fetchTransactions(connection, problem)
    let submission: string | undefined
    let attempt: string | undefined
    let committed: number[] | undefined
    let salt: number[] | undefined
    for (const tx of problemTxs) {
        for (const call of tollCalls(tx)) {
            if (call.accounts.solver !== solver) continue
            if (call.name === 'commit') {
                committed = call.data.commitment as number[]
                attempt = call.accounts.attempt
            }
            if (call.name === 'reveal') {
                salt = call.data.salt as number[]
                submission = call.accounts.submission
            }
        }
    }
    if (!submission || !attempt || !committed || !salt) return null
    const { PublicKey } = await import('@solana/web3.js')
    const writes = await fetchTransactions(connection, new PublicKey(submission))
    const chunks: { offset: number; bytes: Uint8Array }[] = []
    let length = 0
    for (const tx of writes) {
        for (const call of tollCalls(tx)) {
            if (call.name === 'openSubmission') length = Number(call.data.len)
            if (call.name === 'writeSubmission') chunks.push({ offset: Number(call.data.offset), bytes: Uint8Array.from(call.data.bytes as Uint8Array) })
        }
    }
    if (length === 0) return null
    const scheme = new Uint8Array(length)
    for (const chunk of chunks) scheme.set(chunk.bytes.subarray(0, Math.max(0, length - chunk.offset)), chunk.offset)
    const expected = commitment(problem, new PublicKey(solver), Uint8Array.from(salt), scheme)
    return { scheme, submission, attempt, solver, matchesCommitment: Buffer.from(expected).equals(Buffer.from(committed)) }
}
