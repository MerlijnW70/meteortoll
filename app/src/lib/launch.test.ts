import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import BN from 'bn.js'
import type { Program } from '@coral-xyz/anchor'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { Connection, Keypair, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { createDbcProgram, DynamicBondingCurveClient, type FirstBuyParams, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { quoteFirstBuy } from './firstBuy'
import { launchCost, type LaunchRequest, MAX_DIMENSION, NAME_LIMIT, type PreparedLaunch, prepareLaunch, statementProblem, SYMBOL_LIMIT } from './launch'

const ONE = new BN(1_000_000_000)
const key = () => Keypair.generate().publicKey
const valid: LaunchRequest = { n: [2, 2, 2], target: 7, name: 'Strassen', symbol: 'STR', firstBuy: new BN(0) }
const problem = (change: Partial<LaunchRequest>) => statementProblem({ ...valid, ...change })

function testConfig(): PoolConfig {
    const hex = readFileSync(new URL('../../../programs/toll/tests/fixtures/dbc_config_account_test.hex', import.meta.url), 'utf8').trim()
    const { program } = createDbcProgram(new Connection('http://127.0.0.1:8899'))
    return program.coder.accounts.decode('poolConfig', Buffer.from(hex, 'hex')) as PoolConfig
}

test('valid statement', () => {
    assert.equal(problem({}), null)
    assert.equal(problem({ n: [1, 2, 2], target: 1 }), null)
    assert.equal(problem({ n: [MAX_DIMENSION, 1, 1], target: MAX_DIMENSION - 1 }), null)
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
    assert.match(problem({ target: 8 }) ?? '', /schoolbook rank 8/)
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
    const client = new DynamicBondingCurveClient(new Connection('http://127.0.0.1:8899'), 'confirmed')
    t.mock.method(Object.getPrototypeOf(client.state), 'getPoolConfig', async () => config)
    const sent: (FirstBuyParams | undefined)[] = []
    t.mock.method(Object.getPrototypeOf(client.creator), 'createPoolWithFirstBuy', async ({ firstBuyParam }: { firstBuyParam?: FirstBuyParams }) => {
        sent.push(firstBuyParam)
        return new Transaction()
    })
    const ix = new TransactionInstruction({ programId: SystemProgram.programId, keys: [], data: Buffer.alloc(0) })
    const builder = { accountsPartial: () => ({ instruction: async () => ix }) }
    const program = { account: { launchpad: { fetch: async () => ({ dbcConfig: key() }) } }, methods: { registerProblem: () => builder } } as never as Program
    const connection = { getSlot: async () => 0, getBlockTime: async () => 0 } as never as Connection
    const owner = key()
    await prepareLaunch(connection, program, key(), owner, { ...valid, firstBuy: ONE }, 'https://example.test')
    await prepareLaunch(connection, program, key(), owner, valid, 'https://example.test')
    const tokens = quoteFirstBuy(config, ONE, new BN(0)).tokens
    assert.equal(sent[0]?.minimumAmountOut.toString(), tokens.muln(9_950).divn(10_000).toString())
    assert.ok(sent[0]?.buyAmount.eq(ONE))
    assert.equal(sent[1], undefined)
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
