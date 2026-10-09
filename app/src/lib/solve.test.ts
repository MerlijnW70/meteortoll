import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import BN from 'bn.js'
import { utils } from '@coral-xyz/anchor'
import {
    ComputeBudgetInstruction,
    ComputeBudgetProgram,
    type Connection,
    Keypair,
    PublicKey,
    SystemInstruction,
    SystemProgram,
    SYSVAR_SLOT_HASHES_PUBKEY,
    Transaction,
} from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, commitment, statusName, SUBMISSION_HEADER, TOLL, VERIFY_BUDGET, verifyCalls } from '@meteortoll/core'
import { MAX_PRICE } from './fees'
import { ExpiredError, sendAll, waitForSlot } from './solve/send'
import {
    CHUNK,
    commitAndOpen,
    commit,
    commitThenSolve,
    committedSalt,
    revealAndVerifyTxs,
    saveSalt,
    type SolveContext,
    solveCommitted,
    tollWriter,
    uploadTxs,
} from './solve'

const store = new Map<string, string>()
Object.assign(globalThis, {
    localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
    },
})

const solver = Keypair.generate().publicKey
const problem = Keypair.generate().publicKey
const scheme = new Uint8Array(readFileSync(new URL('../../public/samples/7x7x9-rank314.bin', import.meta.url)))

function fakeConnection(log: string[], { fee = 9_000, simulated = null as object | null } = {}) {
    let hashes = 0
    return {
        getMinimumBalanceForRentExemption: async () => 1_000_000,
        getLatestBlockhash: async () => {
            hashes++
            log.push(`blockhash ${hashes}`)
            return { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }
        },
        simulateTransaction: async () => {
            log.push('simulate')
            return { value: { err: simulated, logs: [], unitsConsumed: 1_000 } }
        },
        getAccountInfo: async () => null,
        getRecentPrioritizationFees: async () => [{ prioritizationFee: fee, slot: 1 }],
        getSlot: async () => 1_000_000,
    }
}

const program = (connection: object) =>
    tollWriter(connection as never, { publicKey: solver, signTransaction: async (t: Transaction) => t, signAllTransactions: async (t: Transaction[]) => t } as never)

const attemptState = (salt: Uint8Array, submission: PublicKey): AttemptAccount =>
    ({ status: { committed: {} }, committedSlot: new BN(10), commitment: [...commitment(problem, solver, salt, scheme)], submission, solver }) as never

const budgetOf = (tx: Transaction) => {
    const out: { units?: number; price?: number } = {}
    for (const ix of tx.instructions.filter((i) => i.programId.equals(ComputeBudgetProgram.programId))) {
        const type = ComputeBudgetInstruction.decodeInstructionType(ix)
        if (type === 'SetComputeUnitLimit') out.units = ComputeBudgetInstruction.decodeSetComputeUnitLimit(ix).units
        if (type === 'SetComputeUnitPrice') out.price = Number(ComputeBudgetInstruction.decodeSetComputeUnitPrice(ix).microLamports)
    }
    return out
}

function context(log: string[], connection: object, sent: Transaction[][], salts: Uint8Array[]): SolveContext {
    let state: AttemptAccount | null = null
    return {
        connection: connection as never,
        program: program(connection),
        problem,
        solver,
        scheme,
        send: async (tx) => {
            log.push('prompt commit')
            const opened = tx.instructions[1].keys[1].pubkey
            state = attemptState(salts[0], opened)
            return 'commit-sig'
        },
        sign: async (txs) => {
            log.push('prompt solve')
            sent.push(txs)
            return txs
        },
        note: () => {},
        link: () => {},
        saved: (_, salt) => salts.push(salt),
        fetch: async () => state,
        deliver: async (_, txs) => txs.map((_, i) => `sig${i}`),
    }
}

test('two prompts', async () => {
    store.clear()
    const log: string[] = []
    const sent: Transaction[][] = []
    const connection = fakeConnection(log)
    await commitThenSolve(context(log, connection, sent, []))
    assert.deepEqual(log.filter((l) => l.startsWith('prompt')), ['prompt commit', 'prompt solve'])
    assert.ok(log.indexOf('blockhash 2') > log.indexOf('prompt commit'))
    const [txs] = sent
    assert.equal(txs[0].instructions.at(-1)!.programId.toBase58(), TOLL.toBase58())
    assert.ok(txs.every((tx) => tx.recentBlockhash === txs[0].recentBlockhash))
    assert.ok(txs.length >= 5)
})

test('commit alone asks once and leaves the attempt committed', async () => {
    store.clear()
    const log: string[] = []
    const sent: Transaction[][] = []
    const salts: Uint8Array[] = []
    const { state, salt } = await commit(context(log, fakeConnection(log), sent, salts))
    assert.deepEqual(log.filter((l) => l.startsWith('prompt')), ['prompt commit'])
    assert.equal(sent.length, 0)
    assert.equal(statusName(state.status), 'committed')
    assert.deepEqual(salt, salts[0])
})

test('expiry recovery', async () => {
    store.clear()
    const log: string[] = []
    const sent: Transaction[][] = []
    const connection = fakeConnection(log)
    const ctx = context(log, connection, sent, [])
    let calls = 0
    ctx.deliver = async (_, txs) => {
        calls++
        if (calls === 1) throw new ExpiredError('1 transactions expired before landing')
        return txs.map((_, i) => `sig${i}`)
    }
    await commitThenSolve(ctx)
    assert.deepEqual(log.filter((l) => l.startsWith('prompt')), ['prompt commit', 'prompt solve', 'prompt solve'])
    assert.notEqual(sent[0][0].recentBlockhash, sent[1][0].recentBlockhash)
})

test('expiry once', async () => {
    store.clear()
    const log: string[] = []
    const ctx = context(log, fakeConnection(log), [], [])
    ctx.deliver = async () => {
        throw new ExpiredError('1 transactions expired before landing')
    }
    await assert.rejects(commitThenSolve(ctx), ExpiredError)
    assert.deepEqual(log.filter((l) => l.startsWith('prompt')), ['prompt commit', 'prompt solve', 'prompt solve'])
})

test('other errors', async () => {
    store.clear()
    const log: string[] = []
    const ctx = context(log, fakeConnection(log), [], [])
    ctx.deliver = async () => {
        throw new Error('boom')
    }
    await assert.rejects(commitThenSolve(ctx), /boom/)
    assert.deepEqual(log.filter((l) => l.startsWith('prompt')), ['prompt commit', 'prompt solve'])
})

test('salt after simulation', async () => {
    store.clear()
    const log: string[] = []
    const salts: Uint8Array[] = []
    await assert.rejects(commitThenSolve(context(log, fakeConnection(log, { simulated: { InstructionError: [0, 'Custom'] } }), [], salts)))
    assert.equal(salts.length, 0)
    assert.equal(store.size, 0)
    assert.ok(!log.includes('prompt commit'))
})

test('salt retry', () => {
    store.clear()
    const landed = Uint8Array.from({ length: 32 }, (_, i) => i)
    const retried = Uint8Array.from({ length: 32 }, (_, i) => 255 - i)
    const attempt = attemptAddress(problem, solver)
    saveSalt(attempt, landed)
    saveSalt(attempt, retried)
    assert.deepEqual(committedSalt(problem, solver, scheme, attemptState(landed, solver).commitment), landed)
    assert.deepEqual(committedSalt(problem, solver, scheme, attemptState(retried, solver).commitment), retried)
})

test('legacy salt', () => {
    store.clear()
    const salt = Uint8Array.from({ length: 32 }, (_, i) => i + 3)
    store.set(`meteortoll:salt:${attemptAddress(problem, solver).toBase58()}`, Buffer.from(salt).toString('hex'))
    assert.deepEqual(committedSalt(problem, solver, scheme, attemptState(salt, solver).commitment), salt)
})

test('resume prompt', async () => {
    store.clear()
    const salt = Uint8Array.from({ length: 32 }, (_, i) => i)
    saveSalt(attemptAddress(problem, solver), salt)
    const log: string[] = []
    const sent: Transaction[][] = []
    await solveCommitted(context(log, fakeConnection(log), sent, []), attemptState(salt, Keypair.generate().publicKey))
    assert.deepEqual(log.filter((l) => l.startsWith('prompt')), ['prompt solve'])
})

const accounts = { problem, solver, attempt: attemptAddress(problem, solver), submission: Keypair.generate().publicKey }

test('reveal units', async () => {
    const connection = fakeConnection([])
    const [reveal] = await revealAndVerifyTxs(connection as never, program(connection), accounts, { salt: new Uint8Array(32), work: 1, length: 1 << 20, revealed: false })
    assert.ok(budgetOf(reveal).units! >= 533_000)
    assert.ok(budgetOf(reveal).units! <= 1_400_000)
})

test('verify price', async () => {
    const connection = fakeConnection([], { fee: 40_000 })
    const txs = await revealAndVerifyTxs(connection as never, program(connection), accounts, { salt: new Uint8Array(32), work: 1, length: 10, revealed: true })
    const prices = txs.map((tx) => budgetOf(tx).price!)
    assert.deepEqual(prices, prices.map((_, i) => 40_000 + i))
})

test('verify price cap', async () => {
    const connection = fakeConnection([], { fee: MAX_PRICE * 4 })
    const txs = await revealAndVerifyTxs(connection as never, program(connection), accounts, { salt: new Uint8Array(32), work: 1, length: 10, revealed: true })
    const prices = txs.map((tx) => budgetOf(tx).price!)
    assert.ok(prices.every((p) => p <= MAX_PRICE))
    assert.equal(new Set(prices).size, prices.length)
})

test('reveal budget', async () => {
    const priced = fakeConnection([])
    const [reveal, ...verifies] = await revealAndVerifyTxs(priced as never, program(priced), accounts, { salt: new Uint8Array(32), work: 1, length: 1 << 20, revealed: false })
    assert.deepEqual(budgetOf(reveal), { units: 60_000 + (1 << 19), price: 9_000 })
    assert.equal(verifies.length, verifyCalls(1, VERIFY_BUDGET) + 1)
    const free = fakeConnection([], { fee: 0 })
    const [plain] = await revealAndVerifyTxs(free as never, program(free), accounts, { salt: new Uint8Array(32), work: 1, length: 10, revealed: false })
    assert.deepEqual(budgetOf(plain), { units: 60_005 })
})

test('submission size', async () => {
    const sizes: number[] = []
    const connection = { ...fakeConnection([]), getMinimumBalanceForRentExemption: async (bytes: number) => (sizes.push(bytes), 7) }
    const { tx } = await commitAndOpen(connection as never, program(connection), problem, solver, scheme)
    const made = SystemInstruction.decodeCreateAccount(tx.instructions[1])
    assert.deepEqual(sizes, [SUBMISSION_HEADER + scheme.length])
    assert.equal(made.space, SUBMISSION_HEADER + scheme.length)
    assert.equal(made.lamports, 7)
})

const holding = (held: Uint8Array) => ({
    ...fakeConnection([]),
    getAccountInfo: async () => ({ owner: TOLL, lamports: 1, executable: false, data: Buffer.concat([Buffer.alloc(SUBMISSION_HEADER), held]) }),
})

test('upload skips held', async () => {
    const chunks = Math.ceil(scheme.length / CHUNK)
    const upload = (connection: object) => uploadTxs(connection as never, program(connection), solver, accounts.attempt, accounts.submission, scheme)
    assert.equal((await upload(fakeConnection([]))).length, chunks)
    assert.equal((await upload(holding(scheme))).length, 0)
    assert.equal((await upload(holding(scheme.slice(0, CHUNK)))).length, chunks - 1)
})

const reveals = (txs: Transaction[]) => txs.filter((tx) => tx.instructions.some((ix) => ix.keys.some((k) => k.pubkey.equals(SYSVAR_SLOT_HASHES_PUBKEY)))).length

function clocked(t: { mock: { method: (o: object, name: string, fn: (f: () => void) => void) => void } }, connection: object, ctx: SolveContext) {
    let slot = 0
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => {
        slot++
        setImmediate(fn)
    })
    Object.assign(connection, { getSlot: async () => slot })
    const signs: number[] = []
    const deliveries: [number, number, boolean | undefined][] = []
    const sign = ctx.sign
    ctx.sign = async (txs) => {
        signs.push(slot)
        return sign(txs)
    }
    ctx.deliver = async (_, txs, _progress, opts) => {
        deliveries.push([txs.length, slot, opts?.stopWhen ? await opts.stopWhen() : undefined])
        return txs.map((_, i) => `sig${i}`)
    }
    return { signs, deliveries }
}

test('slot order', async (t) => {
    store.clear()
    const log: string[] = []
    const sent: Transaction[][] = []
    const connection = fakeConnection(log)
    const ctx = context(log, connection, sent, [])
    const { signs, deliveries } = clocked(t, connection, ctx)
    await commitThenSolve(ctx)
    const uploads = Math.ceil(scheme.length / CHUNK)
    const cranks = sent[0].length - uploads - 1
    assert.ok(cranks > 0)
    assert.equal(reveals(sent[0].slice(uploads, uploads + 1)), 1)
    assert.deepEqual(signs, [11])
    assert.deepEqual(deliveries, [
        [uploads, 11, undefined],
        [1, 12, undefined],
        [cranks, 12, true],
    ])
})

test('slot order held', async (t) => {
    store.clear()
    const log: string[] = []
    const sent: Transaction[][] = []
    const connection = { ...fakeConnection(log), getAccountInfo: holding(scheme).getAccountInfo }
    const ctx = context(log, connection, sent, [])
    const { signs, deliveries } = clocked(t, connection, ctx)
    await commitThenSolve(ctx)
    assert.deepEqual(signs, [12])
    assert.deepEqual(deliveries, [
        [1, 12, undefined],
        [sent[0].length - 1, 12, true],
    ])
})

test('expiry after reveal', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    store.clear()
    const log: string[] = []
    const sent: Transaction[][] = []
    const ctx = context(log, fakeConnection(log), sent, [])
    const fetch = ctx.fetch!
    let revealed = false
    ctx.fetch = async () => {
        const state = await fetch()
        return state && revealed ? ({ ...state, status: { revealed: {} } } as AttemptAccount) : state
    }
    let calls = 0
    ctx.deliver = async (_, txs) => {
        calls++
        if (calls === 3) {
            revealed = true
            throw new ExpiredError('1 transactions expired before landing')
        }
        return txs.map((_, i) => `sig${i}`)
    }
    await commitThenSolve(ctx)
    assert.equal(sent.length, 2)
    assert.equal(reveals(sent[0]), 1)
    assert.equal(reveals(sent[1]), 0)
    assert.ok(sent[1].length > 0)
})

test('never landed', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    store.clear()
    const log: string[] = []
    const ctx = context(log, fakeConnection(log), [], [])
    let polls = 0
    ctx.fetch = async () => {
        polls++
        return null
    }
    await assert.rejects(commitThenSolve(ctx), /did not appear/)
    assert.equal(polls, 10)
})

const payer = Keypair.generate()

function signedTx() {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }))
    tx.recentBlockhash = Keypair.generate().publicKey.toBase58()
    tx.feePayer = payer.publicKey
    tx.sign(payer)
    return tx
}

type Status = { err: object | null; confirmationStatus: string } | null

function network(statuses: (round: number) => Status, { valid = true, final = statuses }: { valid?: boolean; final?: (round: number) => Status } = {}) {
    const sent: object[] = []
    const polls: (object | undefined)[] = []
    let round = 0
    const connection = {
        sendRawTransaction: async (raw: Buffer, opts: object) => {
            sent.push(opts)
            return utils.bytes.bs58.encode(Transaction.from(raw).signature!)
        },
        getSignatureStatuses: async (list: string[], opts?: { searchTransactionHistory?: boolean }) => {
            polls.push(opts)
            if (polls.length > 20) throw new Error('runaway')
            const status = opts?.searchTransactionHistory ? final(round) : statuses(round++)
            return { value: list.map(() => status) }
        },
        isBlockhashValid: async () => ({ value: valid }),
        getTransaction: async () => null,
    } as unknown as Connection
    return { connection, sent, polls }
}

test('send confirms', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    const { connection, sent, polls } = network((round) => ({ err: null, confirmationStatus: round === 0 ? 'processed' : 'confirmed' }))
    const progress: number[] = []
    const signatures = await sendAll(connection, [signedTx(), signedTx()], (done) => progress.push(done))
    assert.equal(signatures.length, 2)
    assert.deepEqual(progress, [0, 2])
    assert.equal(polls.length, 2)
    assert.deepEqual(sent, [
        { skipPreflight: true, maxRetries: 5 },
        { skipPreflight: true, maxRetries: 5 },
        { skipPreflight: true, maxRetries: 0 },
        { skipPreflight: true, maxRetries: 0 },
        { skipPreflight: true, maxRetries: 0 },
        { skipPreflight: true, maxRetries: 0 },
    ])
})

test('send failure', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    const { connection } = network(() => ({ err: { InstructionError: [0, { Custom: 1 }] }, confirmationStatus: 'confirmed' }))
    await assert.rejects(sendAll(connection, [signedTx()], () => {}), { name: 'ProgramFailure' })
})

test('send expired', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    const lost = network(() => null, { valid: false })
    await assert.rejects(sendAll(lost.connection, [signedTx()], () => {}), ExpiredError)
    assert.deepEqual(lost.polls, [undefined, { searchTransactionHistory: true }])
    const failed = network(() => null, { valid: false, final: () => ({ err: { x: 1 }, confirmationStatus: 'confirmed' }) })
    await assert.rejects(sendAll(failed.connection, [signedTx()], () => {}), ExpiredError)
})

test('send landed late', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    const { connection } = network(() => null, { valid: false, final: () => ({ err: null, confirmationStatus: 'finalized' }) })
    const progress: number[] = []
    assert.equal((await sendAll(connection, [signedTx()], (done) => progress.push(done))).length, 1)
    assert.deepEqual(progress, [0, 1])
})

test('slot wait', async (t) => {
    t.mock.method(globalThis, 'setTimeout', (fn: () => void) => setImmediate(fn))
    let reads = 0
    const connection = { getSlot: async () => 5 + reads++ } as unknown as Connection
    await waitForSlot(connection, 5)
    assert.equal(reads, 1)
    await waitForSlot(connection, 8)
    assert.equal(reads, 4)
})
