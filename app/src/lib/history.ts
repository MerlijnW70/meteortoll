import { BorshCoder, type Idl, utils } from '@coral-xyz/anchor'
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
    lamports?: bigint
}

export interface InnerInstructions {
    index: number
    instructions: { programIdIndex: number; accounts: number[]; data: string }[]
}

const TOKEN_PROGRAMS = new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VjTdYzSf9n2BNEMmFvpwM8FQCjQx5sNq'])
const TRANSFER = 3
const TRANSFER_CHECKED = 12

function tokenTransfers(keys: string[], inner: InnerInstructions[] | null | undefined, instruction: number) {
    const transfers: { source: string; destination: string; amount: bigint }[] = []
    for (const group of inner ?? []) {
        if (group.index !== instruction) continue
        for (const ix of group.instructions) {
            if (!TOKEN_PROGRAMS.has(keys[ix.programIdIndex])) continue
            const data = utils.bytes.bs58.decode(ix.data)
            if (data.length < 9) continue
            const amount = new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(1, true)
            if (data[0] === TRANSFER) transfers.push({ source: keys[ix.accounts[0]], destination: keys[ix.accounts[1]], amount })
            if (data[0] === TRANSFER_CHECKED) transfers.push({ source: keys[ix.accounts[0]], destination: keys[ix.accounts[2]], amount })
        }
    }
    return transfers
}

export function transferredOut(keys: string[], inner: InnerInstructions[] | null | undefined, instruction: number, source: string): bigint {
    return tokenTransfers(keys, inner, instruction).reduce((sum, t) => sum + (t.source === source ? t.amount : 0n), 0n)
}

export function transferredIn(keys: string[], inner: InnerInstructions[] | null | undefined, instruction: number, destination: string): bigint {
    return tokenTransfers(keys, inner, instruction).reduce((sum, t) => sum + (t.destination === destination ? t.amount : 0n), 0n)
}

export function paidOut(events: HistoryEvent[]): bigint {
    return events.reduce((sum, e) => sum + (e.kind === 'claim' ? (e.lamports ?? 0n) : 0n), 0n)
}

export interface DecodedCall {
    name: string
    data: Record<string, unknown>
    accounts: Record<string, string>
    index: number
}

const BATCH = 40

export async function allSignatures(connection: Connection, address: PublicKey, cap: number) {
    const all: Awaited<ReturnType<Connection['getSignaturesForAddress']>> = []
    let before: string | undefined
    while (all.length < cap) {
        const limit = Math.min(1_000, cap - all.length)
        const page = await withRetry(() => connection.getSignaturesForAddress(address, { limit, before }, 'confirmed'))
        all.push(...page)
        if (page.length < limit) break
        before = page[page.length - 1].signature
    }
    return all
}

export async function fetchTransactions(connection: Connection, address: PublicKey, limit = 200): Promise<VersionedTransactionResponse[]> {
    const signatures = await allSignatures(connection, address, limit)
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

export function tollCalls(tx: VersionedTransactionResponse): DecodedCall[] {
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
    const calls: DecodedCall[] = []
    for (const [index, ix] of tx.transaction.message.compiledInstructions.entries()) {
        if (!keys.get(ix.programIdIndex)?.equals(TOLL)) continue
        const decoded = coder.instruction.decode(Buffer.from(ix.data))
        if (!decoded) continue
        const names = instructionAccounts[decoded.name] ?? instructionAccounts[camel(decoded.name)] ?? []
        const accounts: Record<string, string> = {}
        ix.accountKeyIndexes.forEach((index, i) => {
            if (names[i]) accounts[names[i]] = keys.get(index)?.toBase58() ?? ''
        })
        calls.push({ name: camel(decoded.name), data: decoded.data as Record<string, unknown>, accounts, index })
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

const SWEEP_SOURCES: Record<string, string> = {
    sweepTradingFees: 'curve trading fees',
    sweepSurplus: 'curve surplus',
    sweepPositionFees: 'DAMM v2 position fees',
}

export async function fetchHistory(connection: Connection, problem: PublicKey): Promise<HistoryEvent[]> {
    const txs = await fetchTransactions(connection, problem)
    const events: HistoryEvent[] = []
    for (const tx of txs) {
        const base = { signature: tx.transaction.signatures[0], slot: tx.slot, time: tx.blockTime ?? null }
        const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
        const keyList = keys.keySegments().flat().map((k) => k.toBase58())
        const payer = keyList[0] ?? ''
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
            if (kind === 'claim') {
                const lamports = transferredOut(keyList, tx.meta?.innerInstructions, call.index, call.accounts.quote_vault)
                events.push({ ...base, kind, actor: call.accounts.solver ?? payer, lamports })
            } else if (kind === 'sweep') {
                const lamports = transferredIn(keyList, tx.meta?.innerInstructions, call.index, call.accounts.quote_vault)
                events.push({ ...base, kind, actor: payer, lamports, detail: SWEEP_SOURCES[call.name] })
            } else if (kind) events.push({ ...base, kind, actor: call.accounts.solver ?? call.accounts.cranker ?? payer })
        }
        for (const event of programEvents(tx)) {
            if (event.name === 'Solved' || event.name === 'solved') {
                events.push({ ...base, kind: 'solved', actor: String(event.data.solver), detail: `rank ${String(event.data.rank)}` })
            }
            if (event.name === 'Failed' || event.name === 'failed') events.push({ ...base, kind: 'failed', actor: String(event.data.solver) })
        }
    }
    return events.filter((e, i) => e.kind !== 'verify' || !events.slice(0, i).some((p) => p.kind === 'verify' && p.actor === e.actor))
}

export interface RecoveredScheme {
    scheme: Uint8Array
    submission: string
    attempt: string
    solver: string
    matchesCommitment: boolean
}

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
