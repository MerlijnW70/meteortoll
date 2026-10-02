import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BN, utils } from '@coral-xyz/anchor'
import { ComputeBudgetInstruction, ComputeBudgetProgram, type Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { DAMM_V2 } from '@meteortoll/core'
import { tollReader } from './chain'
import { DAMM_POOL_DISCRIMINATOR, DAMM_TOKEN_A_MINT_OFFSET } from './sweeps'
import { ATTEMPT_STATUS_OFFSET, ATTEMPT_SUBMISSION_OFFSET, checkableProblems, MAX_CRANKS, MIN_BALANCE, pendingChecks, REVEALED, runKeeper, SPEND_CAP } from './keeper'

const key = () => Keypair.generate().publicKey

function attempt(problem: PublicKey, submission: PublicKey, status: number): Uint8Array {
    const data = new Uint8Array(8 + 32 + 32 + 32 + 8 + 32 + 8 + 1 + 60 + 8 + 1)
    data.set(problem.toBytes(), 8)
    data.set(submission.toBytes(), ATTEMPT_SUBMISSION_OFFSET)
    data[ATTEMPT_STATUS_OFFSET] = status
    return data
}

test('revealed attempts', () => {
    const ours = key()
    const submission = key()
    const pubkey = key()
    const found = pendingChecks([{ pubkey, data: attempt(ours, submission, REVEALED) }], new Set([ours.toBase58()]))
    assert.equal(found.length, 1)
    assert.ok(found[0].attempt.equals(pubkey) && found[0].problem.equals(ours) && found[0].submission.equals(submission))
})

test('other attempts', () => {
    const ours = key()
    const rows = [
        { pubkey: key(), data: attempt(ours, key(), 0) },
        { pubkey: key(), data: attempt(ours, key(), 2) },
        { pubkey: key(), data: attempt(ours, key(), 3) },
        { pubkey: key(), data: attempt(key(), key(), REVEALED) },
        { pubkey: key(), data: new Uint8Array(40) },
    ]
    assert.deepEqual(pendingChecks(rows, new Set([ours.toBase58()])), [])
})

test('offsets', () => {
    assert.equal(ATTEMPT_SUBMISSION_OFFSET, 112)
    assert.equal(ATTEMPT_STATUS_OFFSET, 152)
})

test('finalized problems', () => {
    const [open, grace, solved] = [key(), key(), key()].map((k) => k.toBase58())
    const checkable = checkableProblems([
        { address: open, phase: 'open' },
        { address: grace, phase: 'grace' },
        { address: solved, phase: 'solved' },
    ])
    assert.deepEqual([...checkable].sort(), [open, grace].sort())
    const stale = { pubkey: key(), data: attempt(new PublicKey(solved), key(), REVEALED) }
    assert.deepEqual(pendingChecks([stale], checkable), [])
})

function tokenAccount(mint: PublicKey, amount: bigint): Uint8Array {
    const data = new Uint8Array(165)
    data.set(mint.toBytes(), 0)
    new DataView(data.buffer).setBigUint64(64, amount, true)
    return data
}

const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, DAMM_V2)[0]

async function chain({ statuses, position = false, balances = () => 1e9 }: { statuses: (n: number) => number; position?: boolean; balances?: (sent: number) => number }) {
    const problem = key()
    const attemptKey = key()
    const fields = { launchpad: key(), pool: key(), baseMint: key(), quoteMint: key(), baseVault: key(), quoteVault: key() }
    const landed = new Map<string, Transaction>()
    let reads = 0
    const accounts = new Map<string, { owner: PublicKey; data: Buffer; lamports: number; executable: boolean }>()
    const tokenAccounts: { pubkey: PublicKey; account: { data: Buffer } }[] = []
    if (position) {
        const mint = key()
        const dammPool = key()
        const data = Buffer.alloc(200)
        data.set(dammPool.toBytes(), 8)
        data.set(mint.toBytes(), 40)
        const poolData = Buffer.alloc(1112)
        poolData.set(DAMM_POOL_DISCRIMINATOR, 0)
        poolData.set(fields.baseMint.toBytes(), DAMM_TOKEN_A_MINT_OFFSET)
        poolData.set(fields.quoteMint.toBytes(), DAMM_TOKEN_A_MINT_OFFSET + 32)
        accounts.set(dammPool.toBase58(), { owner: DAMM_V2, data: poolData, lamports: 1, executable: false })
        accounts.set(pda(Buffer.from('position'), mint.toBuffer()).toBase58(), { owner: DAMM_V2, data, lamports: 1, executable: false })
        tokenAccounts.push({ pubkey: pda(Buffer.from('position_nft_account'), mint.toBuffer()), account: { data: Buffer.from(tokenAccount(mint, 1n)) } })
    }
    const attemptData = (status: number) => {
        const data = Buffer.from(attempt(problem, key(), status))
        return { owner: key(), data, lamports: 1, executable: false }
    }
    const connection = {
        getProgramAccounts: async (_program: PublicKey, config: { filters: { memcmp: { offset: number } }[] }) => {
            if (config.filters[0].memcmp.offset === 0) return [{ pubkey: problem, account: { data: encoded } }]
            return [{ pubkey: attemptKey, account: attemptData(REVEALED) }]
        },
        getSlot: async () => 0,
        getBalance: async () => balances(landed.size),
        getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map((k) => accounts.get(k.toBase58()) ?? null),
        getAccountInfo: async (k: PublicKey) => (k.equals(attemptKey) ? attemptData(statuses(reads++)) : null),
        getTokenAccountsByOwner: async () => ({ value: tokenAccounts }),
        getRecentPrioritizationFees: async () => [{ prioritizationFee: 1000, slot: 0 }],
        getLatestBlockhash: async () => ({ blockhash: key().toBase58(), lastValidBlockHeight: 1 }),
        simulateTransaction: async () => ({ value: { err: null, logs: [], unitsConsumed: 1, accounts: [{ data: [Buffer.from(tokenAccount(key(), 5n)).toString('base64'), 'base64'] }, null] } }),
        sendRawTransaction: async (raw: Buffer) => {
            const tx = Transaction.from(raw)
            const signature = utils.bytes.bs58.encode(tx.signature!)
            landed.set(signature, tx)
            if (landed.size > 2 * MAX_CRANKS) throw new Error('runaway')
            return signature
        },
        getSignatureStatuses: async (list: string[]) => ({ value: list.map(() => ({ err: null, confirmationStatus: 'confirmed' })) }),
    } as unknown as Connection
    const program = tollReader(connection)
    const encoded = await program.coder.accounts.encode('problem', {
        ...fields,
        n1: 2,
        n2: 2,
        n3: 2,
        targetRank: 7,
        solver: null,
        solvedRank: 0,
        solverCommitSlot: new BN(0),
        solvedAtSlot: new BN(0),
        graceSlots: new BN(0),
        attempts: 0,
        bump: 0,
    })
    return { connection, program, problem, attemptKey, sent: () => [...landed.values()] }
}

const price = (tx: Transaction) => {
    const ix = tx.instructions.find((i) => i.programId.equals(ComputeBudgetProgram.programId) && ComputeBudgetInstruction.decodeInstructionType(i) === 'SetComputeUnitPrice')!
    return Number(ComputeBudgetInstruction.decodeSetComputeUnitPrice(ix).microLamports)
}

const instant = (fn: () => void) => setImmediate(fn)

test('keeper cranks', async (t) => {
    t.mock.method(globalThis, 'setTimeout', instant)
    const { connection, program, attemptKey, sent } = await chain({ statuses: (n) => (n < 2 ? REVEALED : 2) })
    const run = await runKeeper(connection, program, Keypair.generate())
    assert.deepEqual(run, { swept: [], checked: [{ attempt: attemptKey.toBase58(), calls: 3, status: 'holds' }], failures: [], skipped: false, capped: false })
    assert.deepEqual(sent().map(price), [1001, 1002, 1003])
})

test('crank cap', async (t) => {
    t.mock.method(globalThis, 'setTimeout', instant)
    const { connection, program, attemptKey, sent } = await chain({ statuses: () => REVEALED })
    const run = await runKeeper(connection, program, Keypair.generate())
    assert.deepEqual(run.checked, [{ attempt: attemptKey.toBase58(), calls: MAX_CRANKS, status: 'revealed' }])
    assert.equal(sent().length, MAX_CRANKS)
})

test('keeper sweeps', async (t) => {
    t.mock.method(globalThis, 'setTimeout', instant)
    const { connection, program, problem, sent } = await chain({ statuses: () => 3, position: true })
    const run = await runKeeper(connection, program, Keypair.generate())
    assert.deepEqual(run.swept, [problem.toBase58()])
    assert.equal(run.failures.length, 0)
    assert.equal(run.checked[0].status, 'fails')
    assert.equal(sent().length, 2)
})

test('low balance', async (t) => {
    t.mock.method(globalThis, 'setTimeout', instant)
    const { connection, program, sent } = await chain({ statuses: () => REVEALED, position: true, balances: () => MIN_BALANCE - 1 })
    const lines: string[] = []
    const run = await runKeeper(connection, program, Keypair.generate(), (line) => lines.push(line))
    assert.deepEqual(run, { swept: [], checked: [], failures: [], skipped: true, capped: false })
    assert.equal(sent().length, 0)
    assert.match(lines[0], /below/)
})

test('spend cap', async (t) => {
    t.mock.method(globalThis, 'setTimeout', instant)
    const start = 1e9
    const { connection, program, sent } = await chain({ statuses: () => REVEALED, balances: (n) => start - n * (SPEND_CAP / 4) })
    const run = await runKeeper(connection, program, Keypair.generate())
    assert.equal(run.capped, true)
    assert.equal(sent().length, 4)
    assert.equal(run.checked[0].calls, 4)
})
