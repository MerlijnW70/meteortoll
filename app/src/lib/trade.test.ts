import { type TestContext, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import BN from 'bn.js'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { createDbcProgram, DynamicBondingCurveClient, type PoolConfig, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { freshPool } from './firstBuy'
import { executeSwap, lamports, LaunchWindowError, PriceMovedError, type Quote, quoteSwap, swapTransaction, windowSeconds } from './trade'

const ONE = new BN(1_000_000_000)
const owner = Keypair.generate().publicKey
const pool = Keypair.generate().publicKey

function testConfig(): PoolConfig {
    const hex = readFileSync(new URL('../../../programs/toll/tests/fixtures/dbc_config_account_test.hex', import.meta.url), 'utf8').trim()
    const { program } = createDbcProgram(new Connection('http://127.0.0.1:8899'))
    return program.coder.accounts.decode('poolConfig', Buffer.from(hex, 'hex')) as PoolConfig
}

const atSlot = (slot: number) => ({ getSlot: async () => slot, getBlockTime: async () => 0 }) as never as Connection
const poolService = () => Object.getPrototypeOf(new DynamicBondingCurveClient(atSlot(0), 'confirmed').pool)
const stateService = () => Object.getPrototypeOf(new DynamicBondingCurveClient(atSlot(0), 'confirmed').state)

function mockMarket(t: TestContext) {
    const config = testConfig()
    t.mock.method(stateService(), 'getPool', async () => freshPool(config, new BN(0)))
    t.mock.method(stateService(), 'getPoolConfig', async () => config)
    const floors: string[] = []
    t.mock.method(poolService(), 'swap2', async (params: { minimumAmountOut: BN }) => {
        floors.push(params.minimumAmountOut.toString())
        throw new Error('built')
    })
    return floors
}

const priced = (minimumAmountOut: BN, feePercent = 50): Quote => ({ outputAmount: minimumAmountOut, minimumAmountOut, tradingFee: ONE, bounty: ONE, spent: ONE, unspent: ONE, feePercent, windowSlotsLeft: 360 })
const send = async () => 'sig'
const FRESH_OUT = new BN('48076918660877')

test('buy quote', async () => {
    const config = testConfig()
    const quote = await quoteSwap(atSlot(0), { pool: freshPool(config, new BN(0)), config } as never, 'buy', ONE)
    assert.equal(quote.outputAmount.toString(), '48076918660877')
    assert.equal(quote.tradingFee.toString(), '400000000')
    assert.equal(quote.spent.toString(), ONE.toString())
    assert.equal(quote.feePercent, 50)
    assert.equal(quote.windowSlotsLeft, 360)
})

test('sell quote', async () => {
    const config = testConfig()
    const bought = new DynamicBondingCurveClient(atSlot(0), 'confirmed').pool.swapQuote2({
        virtualPool: freshPool(config, new BN(0)),
        config,
        swapBaseForQuote: false,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint: new BN(1_000),
        slippageBps: 100,
        swapMode: SwapMode.PartialFill,
        amountIn: ONE.muln(10),
    })
    const traded = freshPool(config, new BN(0))
    traded.poolState.sqrtPrice = bought.nextSqrtPrice
    traded.poolState.quoteReserve = bought.includedFeeInputAmount.sub(bought.tradingFee).sub(bought.protocolFee)
    const quote = await quoteSwap(atSlot(1_000), { pool: traded, config } as never, 'sell', new BN(1_000_000_000_000))
    assert.equal(quote.outputAmount.toString(), '31745838')
    assert.equal(quote.feePercent, ((256604 + 64150) / (31745838 + 256604 + 64150)) * 100)
    assert.equal(quote.windowSlotsLeft, 0)
})

test('swap side', async (t) => {
    const sides: boolean[] = []
    t.mock.method(poolService(), 'swap2', async (params: { swapBaseForQuote: boolean }) => {
        sides.push(params.swapBaseForQuote)
        return new Transaction()
    })
    await swapTransaction(atSlot(0), owner, pool, 'buy', ONE, new BN(0))
    await swapTransaction(atSlot(0), owner, pool, 'sell', ONE, new BN(0))
    assert.deepEqual(sides, [false, true])
})

test('window seconds', () => {
    assert.equal(windowSeconds(360), 144)
    assert.equal(windowSeconds(1), 1)
})

test('sol to lamports', () => {
    assert.equal(lamports(1.5).toString(), '1500000000')
    assert.equal(lamports(0.000000001).toString(), '1')
})

test('fee guard', async (t) => {
    mockMarket(t)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE, undefined, 10), (error: unknown) => error instanceof LaunchWindowError && error.secondsLeft === 144 && error.feePercent === 50)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE, priced(ONE, 1), 10), (error: unknown) => error instanceof LaunchWindowError)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE, undefined, 50), /built/)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE), /built/)
})

test('price moved', async (t) => {
    const floors = mockMarket(t)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE, priced(FRESH_OUT.addn(1))), PriceMovedError)
    assert.deepEqual(floors, [])
})

test('displayed floor', async (t) => {
    const floors = mockMarket(t)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE, priced(FRESH_OUT)), /built/)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE, priced(new BN(123))), /built/)
    await assert.rejects(executeSwap(atSlot(0), owner, send, pool, 'buy', ONE), /built/)
    assert.deepEqual(floors, [FRESH_OUT.toString(), '123', FRESH_OUT.muln(99).divn(100).toString()])
})

test('bounty share', async () => {
    const config = testConfig()
    config.creatorTradingFeePercentage = 80
    const quote = await quoteSwap(atSlot(0), { pool: freshPool(config, new BN(0)), config } as never, 'buy', ONE)
    assert.equal(quote.tradingFee.toString(), '400000000')
    assert.equal(quote.bounty.toString(), '320000000')
})
