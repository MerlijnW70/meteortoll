import type { Program } from '@coral-xyz/anchor'
import { utils } from '@coral-xyz/anchor'
import { type Connection, type Keypair, PublicKey, type Transaction } from '@solana/web3.js'
import { fetchProblems, type ProblemView } from './chain'
import { estimatePrice } from './fees'
import { sweepTxs, verifyTx } from './solve/build'
import { prepare, sendAll } from './solve/send'
import { simulateOrThrow } from './tx'

export const ATTEMPT_STATUS_OFFSET = 8 + 32 + 32 + 32 + 8 + 32 + 8
export const ATTEMPT_SUBMISSION_OFFSET = 8 + 32 + 32 + 32 + 8
export const REVEALED = 1
export const MAX_CRANKS = 40
export const MIN_BALANCE = 20_000_000
export const SPEND_CAP = 100_000_000

const STATUS_NAMES = ['committed', 'revealed', 'holds', 'fails']

export interface PendingCheck {
    attempt: PublicKey
    problem: PublicKey
    submission: PublicKey
}

export function pendingChecks(rows: { pubkey: PublicKey; data: Uint8Array }[], problems: Set<string>): PendingCheck[] {
    const found: PendingCheck[] = []
    for (const { pubkey, data } of rows) {
        if (data.length <= ATTEMPT_STATUS_OFFSET || data[ATTEMPT_STATUS_OFFSET] !== REVEALED) continue
        const problem = new PublicKey(data.subarray(8, 40))
        if (!problems.has(problem.toBase58())) continue
        const submission = new PublicKey(data.subarray(ATTEMPT_SUBMISSION_OFFSET, ATTEMPT_SUBMISSION_OFFSET + 32))
        found.push({ attempt: pubkey, problem, submission })
    }
    return found
}

export function checkableProblems(problems: Pick<ProblemView, 'address' | 'phase'>[]): Set<string> {
    return new Set(problems.filter((p) => p.phase !== 'solved').map((p) => p.address))
}

async function send(connection: Connection, keeper: Keypair, txs: Transaction[]) {
    if (txs.length === 0) return []
    await prepare(connection, txs, keeper.publicKey)
    for (const tx of txs) await simulateOrThrow(connection, tx)
    for (const tx of txs) tx.sign(keeper)
    return sendAll(connection, txs, () => {})
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export interface KeeperRun {
    swept: string[]
    checked: { attempt: string; calls: number; status: string }[]
    failures: string[]
    skipped: boolean
    capped: boolean
}

export interface KeeperLimits {
    floor: number
    cap: number
}

export async function runKeeper(
    connection: Connection,
    program: Program,
    keeper: Keypair,
    log: (line: string) => void = () => {},
    limits: KeeperLimits = { floor: MIN_BALANCE, cap: SPEND_CAP }
): Promise<KeeperRun> {
    const run: KeeperRun = { swept: [], checked: [], failures: [], skipped: false, capped: false }
    const balance = () => connection.getBalance(keeper.publicKey, 'confirmed')
    const start = await balance()
    if (start < limits.floor) {
        log(`balance ${start / 1e9} SOL is below the ${limits.floor / 1e9} SOL floor, skipping`)
        return { ...run, skipped: true }
    }
    const within = async () => {
        if (run.capped) return false
        if (start - (await balance()) < limits.cap) return true
        log(`spent the ${limits.cap / 1e9} SOL cap, stopping`)
        run.capped = true
        return false
    }
    const problems: ProblemView[] = await fetchProblems(connection)

    for (const problem of problems) {
        if (!(await within())) return run
        try {
            const txs = await sweepTxs(connection, program, new PublicKey(problem.address), problem.account, keeper.publicKey)
            const signatures = await send(connection, keeper, txs)
            if (signatures.length > 0) {
                run.swept.push(problem.address)
                log(`swept ${problem.address}: ${signatures.join(', ')}`)
            }
        } catch (error) {
            run.failures.push(`sweep ${problem.address}: ${message(error)}`)
        }
    }

    const checkable = checkableProblems(problems)
    const accounts = await connection.getProgramAccounts(program.programId, {
        commitment: 'confirmed',
        filters: [{ memcmp: { offset: ATTEMPT_STATUS_OFFSET, bytes: utils.bytes.bs58.encode([REVEALED]) } }],
    })
    for (const pending of pendingChecks(accounts.map((a) => ({ pubkey: a.pubkey, data: a.account.data })), checkable)) {
        if (!(await within())) return run
        let calls = 0
        try {
            const price = await estimatePrice(connection, [])
            while (calls < MAX_CRANKS && (await within())) {
                calls += 1
                await send(connection, keeper, [await verifyTx(program, { cranker: keeper.publicKey, ...pending }, price + calls)])
                const info = await connection.getAccountInfo(pending.attempt, 'confirmed')
                if (!info || info.data[ATTEMPT_STATUS_OFFSET] !== REVEALED) break
            }
            const after = await connection.getAccountInfo(pending.attempt, 'confirmed')
            const status = after ? (STATUS_NAMES[after.data[ATTEMPT_STATUS_OFFSET]] ?? 'unknown') : 'closed'
            run.checked.push({ attempt: pending.attempt.toBase58(), calls, status })
            log(`checked ${pending.attempt.toBase58()} in ${calls} calls: ${status}`)
        } catch (error) {
            run.failures.push(`check ${pending.attempt.toBase58()}: ${message(error)}`)
        }
    }
    return run
}
