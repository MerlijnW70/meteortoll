// Quotes and swap transactions on a problem's DBC pool, shared by the trade panel and the
// quick-buy buttons so both price and protect trades the same way.

import BN from 'bn.js'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, getCurrentPoint, type SwapQuoteResult } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { withRetry } from './rpc'
import { sendWithWallet, type WalletSend } from './tx'

export const SLIPPAGE_BPS = 100

export async function loadMarket(connection: Connection, pool: PublicKey) {
    const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
    const state = await withRetry(() => dbc.state.getPool(pool))
    if (!state) throw new Error('pool not found')
    const config = await withRetry(() => dbc.state.getPoolConfig(state.poolState.config))
    if (!config) throw new Error('config not found')
    return { pool: state, config }
}

export type Market = Awaited<ReturnType<typeof loadMarket>>

export async function quoteSwap(connection: Connection, market: Market, side: 'buy' | 'sell', amountIn: BN): Promise<SwapQuoteResult> {
    const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
    const currentPoint = await withRetry(() => getCurrentPoint(connection, market.config.activationType))
    return dbc.pool.swapQuote({
        virtualPool: market.pool,
        config: market.config,
        swapBaseForQuote: side === 'sell',
        amountIn,
        slippageBps: SLIPPAGE_BPS,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint,
    })
}

export async function swapTransaction(
    connection: Connection,
    owner: PublicKey,
    pool: PublicKey,
    side: 'buy' | 'sell',
    amountIn: BN,
    minimumAmountOut: BN
): Promise<Transaction> {
    const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
    return withRetry(() =>
        dbc.pool.swap({ owner, pool, amountIn, minimumAmountOut, swapBaseForQuote: side === 'sell', referralTokenAccount: null })
    )
}

/// Quotes, builds, signs through the wallet and confirms a swap. Returns the signature.
export async function executeSwap(
    connection: Connection,
    owner: PublicKey,
    send: WalletSend,
    pool: PublicKey,
    side: 'buy' | 'sell',
    amountIn: BN,
    quote?: SwapQuoteResult
): Promise<string> {
    const priced = quote ?? (await quoteSwap(connection, await loadMarket(connection, pool), side, amountIn))
    const tx = await swapTransaction(connection, owner, pool, side, amountIn, priced.minimumAmountOut)
    return sendWithWallet(connection, tx, owner, send)
}

export const lamports = (sol: number) => new BN(Math.floor(sol * 1e9).toString())
