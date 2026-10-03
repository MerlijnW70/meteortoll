import { type TestContext, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import BN from 'bn.js'
import type { Program } from '@coral-xyz/anchor'
import { ACCOUNT_SIZE, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Connection, Keypair, type PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { createDbcProgram, DynamicBondingCurveClient, type FirstBuyParams, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { problemAddress } from '@meteortoll/core'
import { applyBudget } from './fees'
import { quoteFirstBuy } from './firstBuy'
import {
    finishRegistration,
    launchCost,
    launchTerms,
    type LaunchRequest,
    MAX_DIMENSION,
    NAME_LIMIT,
    type Pinned,
    type PreparedLaunch,
    prepareLaunch,
    statementProblem,
    SYMBOL_LIMIT,
    termsProblem,
} from './launch'

const ONE = new BN(1_000_000_000)
const key = () => Keypair.generate().publicKey
const valid: LaunchRequest = { n: [2, 12, 15], target: 277, name: 'Two by twelve', symbol: 'MM21215', firstBuy: new BN(0) }
const problem = (change: Partial<LaunchRequest>) => statementProblem({ ...valid, ...change })
const WINDOWED = { treasurySharePercent: 0, launchFeeSol: 0, launchWindow: { startingFeeBps: 5000, endingFeeBps: 100, numberOfPeriod: 24, totalDurationSlots: 360 } }

function testConfig(): PoolConfig {
    const hex = readFileSync(new URL('../../../programs/toll/tests/fixtures/dbc_config_account_test.hex', import.meta.url), 'utf8').trim()
    const { program } = createDbcProgram(new Connection('http://127.0.0.1:8899'))
    const config = program.coder.accounts.decode('poolConfig', Buffer.from(hex, 'hex')) as PoolConfig
    config.quoteMint = NATIVE_MINT
    return config
}

const DBC_PROGRAM = createDbcProgram(new Connection('http://127.0.0.1:8899')).program.programId
const dbcClient = () => new DynamicBondingCurveClient(new Connection('http://127.0.0.1:8899'), 'confirmed')
const ix = new TransactionInstruction({ programId: SystemProgram.programId, keys: [], data: Buffer.alloc(0) })
const fakeProgram = (dbcConfig: PublicKey) =>
    ({ account: { launchpad: { fetch: async () => ({ dbcConfig }) } }, methods: { registerProblem: () => ({ accountsPartial: () => ({ instruction: async () => ix }) }) } }) as never as Program

test('valid statement', () => {
    assert.equal(problem({}), null)
    assert.equal(problem({ n: [3, 3, 3], target: 9 }), null)
    assert.equal(problem({ n: [MAX_DIMENSION, MAX_DIMENSION, MAX_DIMENSION], target: 256 }), null)
    assert.equal(problem({ name: 'x'.repeat(NAME_LIMIT), symbol: 'A'.repeat(SYMBOL_LIMIT) }), null)
})

test('bad dimensions', () => {
    assert.match(problem({ n: [0, 2, 2] }) ?? '', /dimensions/)
    assert.match(problem({ n: [MAX_DIMENSION + 1, 2, 2] }) ?? '', /dimensions/)
    assert.match(problem({ n: [2.5, 2, 2] }) ?? '', /dimensions/)
})

test('bad target', () => {
    assert.match(problem({ target: 0 }) ?? '', /at least 1/)
    assert.match(problem({ target: 1.5 }) ?? '', /at least 1/)
    assert.match(problem({ target: 360 }) ?? '', /schoolbook rank 360/)
})

test('rank floor', () => {
    assert.match(problem({ n: [3, 3, 3], target: 8 }) ?? '', /fewer than 9 multiplications/)
    assert.match(problem({ n: [2, 12, 15], target: 179 }) ?? '', /fewer than 180/)
    assert.match(problem({ n: [1, 2, 2], target: 3 }) ?? '', /exactly 4/)
    assert.match(problem({ n: [2, 2, 2], target: 6 }) ?? '', /exactly 7 \(Winograd 1971\)/)
    assert.match(problem({ n: [2, 5, 2], target: 17 }) ?? '', /exactly 18 \(Hopcroft and Kerr 1971\)/)
})

test('already answered', () => {
    assert.match(problem({ n: [2, 2, 2], target: 7 }) ?? '', /already answered/)
    assert.match(problem({ n: [2, 2, 5], target: 19 }) ?? '', /already answered/)
    assert.match(problem({ target: 278 }) ?? '', /rank-278 .* already published/)
    assert.match(problem({ n: [15, 2, 12], target: 300 }) ?? '', /already published/)
    assert.equal(problem({ target: 180 }), null)
})

test('first buy cap', () => {
    assert.equal(problem({ firstBuy: ONE }), null)
    assert.match(problem({ firstBuy: ONE.addn(1) }) ?? '', /at most 1 SOL/)
})

test('bad name', () => {
    assert.match(problem({ name: '   ' }) ?? '', /name/)
    assert.match(problem({ name: 'x'.repeat(NAME_LIMIT + 1) }) ?? '', /name/)
})

test('bad symbol', () => {
    assert.match(problem({ symbol: 'str' }) ?? '', /symbol/)
    assert.match(problem({ symbol: '' }) ?? '', /symbol/)
    assert.match(problem({ symbol: 'A'.repeat(SYMBOL_LIMIT + 1) }) ?? '', /symbol/)
})

test('first buy floor', async (t) => {
    const config = testConfig()
    const client = dbcClient()
    t.mock.method(Object.getPrototypeOf(client.state), 'getPoolConfig', async () => config)
    const sent: (FirstBuyParams | undefined)[] = []
    t.mock.method(Object.getPrototypeOf(client.creator), 'createPoolWithFirstBuy', async ({ firstBuyParam }: { firstBuyParam?: FirstBuyParams }) => {
        sent.push(firstBuyParam)
        return new Transaction()
    })
    const pinned: Pinned = { config: key(), economics: WINDOWED }
    const program = fakeProgram(pinned.config!)
    const connection = { getSlot: async () => 0, getBlockTime: async () => 0 } as never as Connection
    const owner = key()
    const launched = await prepareLaunch(connection, program, key(), owner, { ...valid, firstBuy: ONE }, 'https://example.test', pinned)
    await prepareLaunch(connection, program, key(), owner, valid, 'https://example.test', pinned)
    await assert.rejects(prepareLaunch(connection, program, key(), owner, { ...valid, firstBuy: ONE.muln(2) }, 'https://example.test', pinned), /at most 1 SOL/)
    await assert.rejects(prepareLaunch(connection, program, key(), owner, { ...valid, target: 278 }, 'https://example.test', pinned), /already published/)
    assert.equal(sent.length, 2)
    const handOver = launched.create.instructions.at(-1)!
    assert.ok(handOver.programId.equals(DBC_PROGRAM))
    assert.deepEqual(
        handOver.keys.slice(0, 4).map((k) => k.pubkey.toBase58()),
        [launched.pool, pinned.config!, owner, launched.problem].map((k) => k.toBase58())
    )
    assert.equal(launched.register.instructions.length, 1)
    assert.ok(launched.register.instructions[0] === ix)
    const tokens = quoteFirstBuy(config, ONE, new BN(0)).tokens
    assert.equal(sent[0]?.minimumAmountOut.toString(), tokens.muln(9_950).divn(10_000).toString())
    assert.ok(sent[0]?.buyAmount.eq(ONE))
    assert.equal(sent[1], undefined)
})

test('create fits', async (t) => {
    const config = testConfig()
    t.mock.method(Object.getPrototypeOf(dbcClient().state), 'getPoolConfig', async () => config)
    const pinned: Pinned = { config: key(), economics: WINDOWED }
    const owner = key()
    const connection = {
        getSlot: async () => 0,
        getBlockTime: async () => 0,
        getAccountInfo: async (address: PublicKey) => (address.equals(NATIVE_MINT) ? { owner: TOKEN_PROGRAM_ID, data: Buffer.alloc(82), lamports: 1, executable: false } : null),
    } as never as Connection
    const launched = await prepareLaunch(connection, fakeProgram(pinned.config!), key(), owner, { ...valid, firstBuy: ONE, name: 'x'.repeat(NAME_LIMIT), symbol: 'A'.repeat(SYMBOL_LIMIT) }, 'https://meteortoll.example.com', pinned)
    assert.ok(launched.create.instructions.at(-1)!.programId.equals(DBC_PROGRAM))
    applyBudget(launched.create, { units: 400_000, price: 1_000_000 })
    launched.create.feePayer = owner
    launched.create.recentBlockhash = key().toBase58()
    const size = launched.create.serialize({ requireAllSignatures: false, verifySignatures: false }).length
    assert.ok(size <= 1232, `create is ${size} bytes`)
})

test('config pinned', async (t) => {
    const fetched: string[] = []
    t.mock.method(Object.getPrototypeOf(dbcClient().state), 'getPoolConfig', async (address: PublicKey) => {
        fetched.push(address.toBase58())
        return testConfig()
    })
    const pinned: Pinned = { config: key(), economics: WINDOWED }
    const connection = {} as never as Connection
    await assert.rejects(launchTerms(connection, fakeProgram(key()), key(), pinned), /not the expected/)
    await assert.rejects(launchTerms(connection, fakeProgram(key()), key(), { ...pinned, config: null }), /no launchpad config is pinned/)
    assert.deepEqual(fetched, [])
    const terms = await launchTerms(connection, fakeProgram(pinned.config!), key(), pinned)
    assert.ok(terms.address.equals(pinned.config!))
    await assert.rejects(launchTerms(connection, fakeProgram(pinned.config!), key(), { ...pinned, economics: { ...WINDOWED, treasurySharePercent: 20 } }), /published terms/)
})

test('terms mismatch', () => {
    const honest = testConfig()
    assert.equal(termsProblem(honest, WINDOWED), null)
    const changed = (change: (config: PoolConfig) => void) => {
        const config = testConfig()
        change(config)
        return termsProblem(config, WINDOWED)
    }
    assert.match(changed((c) => (c.quoteMint = key())) ?? '', /SOL/)
    assert.match(changed((c) => (c.poolCreationFee = new BN(5_000_000_000))) ?? '', /launch fee is 5 SOL/)
    assert.match(changed((c) => (c.creatorTradingFeePercentage = 0)) ?? '', /0% of trading fees/)
    assert.match(changed((c) => (c.poolFees.baseFee.cliffFeeNumerator = new BN(990_000_000))) ?? '', /fee schedule/)
    assert.match(changed((c) => (c.enableFirstSwapWithMinFee = 0)) ?? '', /fee schedule/)
    assert.match(changed((c) => (c.migrationFeeOption = 0)) ?? '', /migration/)
    assert.match(termsProblem(honest, { ...WINDOWED, launchWindow: null }) ?? '', /fee schedule/)
    assert.match(termsProblem(honest, { ...WINDOWED, launchFeeSol: 0.5 }) ?? '', /not 0.5 SOL/)
})

function resumeSetup(t: TestContext, creator: 'owner' | 'problem' | 'other', registered = false) {
    const owner = key()
    const pool = key()
    const baseMint = key()
    const pinned: Pinned = { config: key(), economics: WINDOWED }
    const pending = { n: [2, 2, 2] as [number, number, number], target: 7, pool: pool.toBase58(), baseMint: baseMint.toBase58() }
    const launchpad = key()
    const problem = problemAddress(launchpad, pool, pending.n, pending.target)
    const state = Object.getPrototypeOf(dbcClient().state)
    t.mock.method(state, 'getPoolConfig', async () => testConfig())
    t.mock.method(state, 'getPool', async () => ({ poolState: { creator: creator === 'owner' ? owner : creator === 'problem' ? problem : key(), baseMint, config: pinned.config } }))
    const connection = { getAccountInfo: async () => (registered ? {} : null) } as never as Connection
    return finishRegistration(connection, fakeProgram(pinned.config!), launchpad, owner, pending, pinned).then((found) => ({ found, problem }))
}

test('finish registration', async (t) => {
    const { found, problem } = await resumeSetup(t, 'owner')
    assert.ok(found?.problem.equals(problem))
    assert.equal(found?.register.instructions.length, 2)
})

test('register only', async (t) => {
    const { found } = await resumeSetup(t, 'problem')
    assert.equal(found?.register.instructions.length, 1)
    assert.ok(found?.register.instructions[0] === ix)
})

test('nothing to finish', async (t) => {
    assert.equal((await resumeSetup(t, 'owner', true)).found, null)
    assert.equal((await resumeSetup(t, 'other')).found, null)
})

function costConnection(after: number | undefined) {
    const options: unknown[] = []
    const connection = {
        getBalance: async () => 10_000_000,
        simulateTransaction: async (_tx: unknown, opts: unknown) => {
            options.push(opts)
            return { value: { err: null, accounts: after === undefined ? [] : [{ lamports: after }] } }
        },
        getFeeForMessage: async () => ({ value: 5_000 }),
        getMinimumBalanceForRentExemption: async (size: number) => (size === ACCOUNT_SIZE ? 300 : 1_000),
    } as never as Connection
    return { connection, options }
}

function prepared(): PreparedLaunch {
    const payer = key()
    const tx = () => {
        const t = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: key(), lamports: 1 }))
        t.feePayer = payer
        t.recentBlockhash = key().toBase58()
        return t
    }
    return { create: tx(), register: tx(), baseMint: Keypair.generate(), pool: key(), problem: key() }
}

const costProgram = { account: { problem: { size: 500 } } } as never as Program

test('launch cost', async () => {
    const { connection, options } = costConnection(4_000_000)
    const owner = key()
    assert.equal(await launchCost(connection, costProgram, prepared(), owner), 6_000_000n + 5_000n + 1_600n)
    assert.deepEqual(options[0], {
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses: [owner.toBase58()] },
    })
})

test('no balance', async () => {
    const { connection } = costConnection(undefined)
    await assert.rejects(launchCost(connection, costProgram, prepared(), key()), /no balance/)
})
