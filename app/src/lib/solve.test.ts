import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import BN from 'bn.js'
import { ComputeBudgetInstruction, ComputeBudgetProgram, Keypair, PublicKey, type Transaction } from '@solana/web3.js'
import { type AttemptAccount, attemptAddress, commitment, TOLL } from '@meteortoll/core'
import { MAX_PRICE } from './fees'
import { ExpiredError } from './solve/send'
import { commitThenSolve, committedSalt, revealAndVerifyTxs, saveSalt, type SolveContext, solveCommitted, tollWriter } from './solve'

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
