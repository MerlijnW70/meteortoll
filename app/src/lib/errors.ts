// One place that turns any failure — wallet, RPC, simulation, program — into a message a person
// can act on. Program errors are resolved against the IDL of the program that raised them, since
// the toll program and DBC both number their errors from 6000.

import type { PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DBC, TOLL, tollIdl } from '@meteortoll/core'

export type ErrorKind = 'cancelled' | 'funds' | 'slippage' | 'program' | 'expired' | 'busy' | 'network' | 'unknown'

export interface Friendly {
    kind: ErrorKind
    title: string
    detail?: string
    signature?: string
    logs?: string[]
}

interface IdlError {
    code: number
    name: string
    msg?: string
}

const programErrors = new Map<string, Map<number, IdlError>>([
    [TOLL.toBase58(), new Map(((tollIdl as unknown as { errors?: IdlError[] }).errors ?? []).map((e) => [e.code, e]))],
    [DBC.toBase58(), new Map(((DynamicBondingCurveIdl as unknown as { errors?: IdlError[] }).errors ?? []).map((e) => [e.code, e]))],
])

const programNames: Record<string, string> = { [TOLL.toBase58()]: 'the toll program', [DBC.toBase58()]: 'Meteora DBC' }

/// Clearer wording for the failures people actually meet.
const friendlier: Record<string, Partial<Friendly>> = {
    ExceededSlippage: { kind: 'slippage', title: 'The price moved more than your 1% limit', detail: 'Someone traded first. Check the new quote and try again.' },
    InsufficientLiquidity: { title: 'The curve does not have that much left', detail: 'Try a smaller amount.' },
    AlreadySolved: { title: 'This problem already has a verified scheme', detail: 'New attempts are closed.' },
    GracePending: { title: 'Claims are not open yet', detail: 'An earlier commitment could still take the solve during the grace window.' },
    CommitmentMismatch: { title: 'The upload does not match your commitment', detail: 'The file differs from the one you committed. Abandon the attempt to get your bond back.' },
    RevealTooEarly: { kind: 'busy', title: 'Too early to reveal', detail: 'The network has not produced a newer slot yet. Try again in a few seconds.' },
    NotSolver: { title: 'Only the solver can claim this bounty' },
    CheckPending: { title: 'The check is still running', detail: 'Finish the verification before closing the attempt.' },
}

/// A transaction that failed on-chain or in simulation, with what is known about where.
export class ProgramFailure extends Error {
    constructor(
        message: string,
        readonly programId?: PublicKey,
        readonly code?: number,
        readonly logs: string[] = [],
        readonly signature?: string
    ) {
        super(message)
        this.name = 'ProgramFailure'
    }
}

/// Reads `{"InstructionError":[i,{"Custom":n}]}` and similar into a failure tied to its program.
export function failureFromStatus(err: unknown, programIds: PublicKey[], logs: string[] = [], signature?: string): ProgramFailure {
    const instruction = (err as { InstructionError?: [number, unknown] })?.InstructionError
    const custom = instruction && typeof instruction[1] === 'object' ? (instruction[1] as { Custom?: number }).Custom : undefined
    const programId = instruction ? programIds[instruction[0]] : undefined
    return new ProgramFailure(JSON.stringify(err), programId, custom, logs, signature)
}

function logsOf(error: unknown): string[] {
    const candidate = error as { logs?: unknown; transactionLogs?: unknown }
    for (const value of [candidate?.logs, candidate?.transactionLogs]) if (Array.isArray(value)) return value.map(String)
    return []
}

/// Anchor writes "Error Code: Name. Error Number: 6033. Error Message: …" into the logs.
function anchorFromLogs(logs: string[]): { name: string; message: string } | null {
    for (const line of logs) {
        const match = line.match(/Error Code: (\w+)\. Error Number: \d+\. Error Message: (.*?)\.?$/)
        if (match) return { name: match[1], message: match[2] }
    }
    return null
}

function fundsInLogs(logs: string[], text: string): boolean {
    return /insufficient lamports|insufficient funds|found no record of a prior credit|AccountNotFound|InsufficientFundsFor(Fee|Rent)|custom program error: 0x1$/im.test(
        `${text}\n${logs.join('\n')}`
    )
}

export function describeError(error: unknown): Friendly {
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    const logs = logsOf(error)
    const signature = error instanceof ProgramFailure ? error.signature : undefined

    if (/User rejected|rejected the request|declined|cancell?ed by user|4001/i.test(text)) {
        return { kind: 'cancelled', title: 'Cancelled in your wallet', detail: 'Nothing was sent.' }
    }
    if (/WalletNotConnected|wallet not connected/i.test(text)) return { kind: 'cancelled', title: 'Connect a wallet first' }

    const fromLogs = anchorFromLogs(logs)
    let named: { name: string; message: string; program?: string } | null = fromLogs
    if (!named && error instanceof ProgramFailure && error.programId && error.code !== undefined) {
        const entry = programErrors.get(error.programId.toBase58())?.get(error.code)
        if (entry) named = { name: entry.name, message: entry.msg ?? entry.name, program: programNames[error.programId.toBase58()] }
    }
    if (named) {
        const better = friendlier[named.name]
        return { kind: 'program', title: named.message, detail: named.program ? `Rejected by ${named.program}.` : undefined, ...better, signature, logs }
    }

    // Meteora's SDK refuses some amounts while quoting, before any transaction exists.
    if (/Insufficient Liquidity/i.test(text)) return { kind: 'program', ...friendlier.InsufficientLiquidity } as Friendly
    if (/amount.*(zero|must be greater)|invalid amount/i.test(text)) return { kind: 'program', title: 'Enter an amount above zero' }

    if (fundsInLogs(logs, text)) {
        return { kind: 'funds', title: 'Not enough SOL', detail: 'The wallet needs SOL for this amount plus fees and account rent.', signature, logs }
    }
    if (/block height exceeded|blockhash not found|expired/i.test(text)) {
        return { kind: 'expired', title: 'The network did not confirm in time', detail: 'Nothing was charged if it did not land. Try again.', signature }
    }
    if (/429|rate limit|too many requests/i.test(text)) {
        return { kind: 'busy', title: 'The network is busy', detail: 'Wait a moment and try again.' }
    }
    if (/failed to fetch|networkerror|network request failed|load failed|ECONNRESET|timed? ?out|offline/i.test(text)) {
        return { kind: 'network', title: 'Could not reach the network', detail: 'Check your connection and try again.' }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { kind: 'unknown', title: 'Something went wrong', detail: message.length > 240 ? `${message.slice(0, 240)}…` : message, signature, logs }
}
