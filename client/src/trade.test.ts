import { test } from 'node:test'
import assert from 'node:assert/strict'
import BN from 'bn.js'
import { Keypair, type Connection } from '@solana/web3.js'
import type { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { buyTransaction, parseLimits, windowSlotsLeft } from './trade.js'

const baseFee = { baseFeeMode: 1, firstFactor: 24, secondFactor: new BN(15) }
const connection = { getSlot: async () => 1_100 } as unknown as Connection

function market(fee: number, output = 1_000_000) {
    const swaps: Record<string, unknown>[] = []
    const quotes: Record<string, unknown>[] = []
    const dbc = {
        state: {
            getPool: async () => ({ poolState: { config: Keypair.generate().publicKey, activationPoint: new BN(1_000) } }),
            getPoolConfig: async () => ({ activationType: 0, poolFees: { baseFee } }),
        },
        pool: {
            swapQuote2: (params: Record<string, unknown>) => {
                quotes.push(params)
                return { outputAmount: new BN(output), tradingFee: new BN(fee), protocolFee: new BN(0), includedFeeInputAmount: new BN(100) }
            },
            swap2: async (params: Record<string, unknown>) => {
                swaps.push(params)
                return 'tx'
            },
        },
    } as unknown as DynamicBondingCurveClient
    return { dbc, swaps, quotes }
}

const owner = Keypair.generate().publicKey
const pool = Keypair.generate().publicKey

test('buy slippage', async () => {
    const { dbc, swaps, quotes } = market(1)
    await buyTransaction(dbc, connection, owner, pool, new BN(100), parseLimits('1', '5'))
    assert.equal(quotes[0].slippageBps, 100)
    assert.equal((swaps[0].minimumAmountOut as BN).toString(), '990000')
    await buyTransaction(dbc, connection, owner, pool, new BN(100), parseLimits('2.5', '5'))
    assert.equal((swaps[1].minimumAmountOut as BN).toString(), '975000')
})

test('fee cap', async () => {
    const { dbc, swaps } = market(40)
    await assert.rejects(buyTransaction(dbc, connection, owner, pool, new BN(100), parseLimits('1', '5')), /fee is 40\.0%, above --max-fee 5%; the launch window ends in about 104 s/)
    assert.equal(swaps.length, 0)
    await buyTransaction(dbc, connection, owner, pool, new BN(100), parseLimits('1', '50'))
    assert.equal(swaps.length, 1)
})

test('empty quote', async () => {
    const { dbc, swaps } = market(1, 0)
    await assert.rejects(buyTransaction(dbc, connection, owner, pool, new BN(100), parseLimits('1', '5')), /no tokens/)
    assert.equal(swaps.length, 0)
})

test('bad limits', () => {
    assert.throws(() => parseLimits('100', '5'), /--slippage/)
    assert.throws(() => parseLimits('x', '5'), /--slippage/)
    assert.throws(() => parseLimits('1', '-1'), /--max-fee/)
})

test('window left', () => {
    assert.equal(windowSlotsLeft(baseFee, 1_000n, 1_100n), 260)
    assert.equal(windowSlotsLeft(baseFee, 1_000n, 2_000n), 0)
    assert.equal(windowSlotsLeft({ ...baseFee, baseFeeMode: 2 }, 1_000n, 1_100n), 0)
})
