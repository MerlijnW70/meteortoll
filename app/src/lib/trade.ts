// Quotes and swap transactions on a problem's DBC pool, shared by the trade panel and the
// quick-buy buttons so both price and protect trades the same way.

import BN from 'bn.js'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, getCurrentPoint, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
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

/// A priced trade. Trades fill partially: a buy larger than what the curve has left takes only
/// what completes the curve, and the rest never leaves the wallet. Without that, the last buyer
/// would have to guess the exact remaining amount and a curve could stall a hair short of graduating.
export interface Quote {
    outputAmount: BN
    minimumAmountOut: BN
    tradingFee: BN
    /// What the trade takes from the wallet, fee included.
    spent: BN
    /// What it leaves in the wallet because the curve is full.
    unspent: BN
}

/// Slippage applied to an output amount, rounding down.
export const withSlippage = (out: BN) => out.muln(10_000 - SLIPPAGE_BPS).divn(10_000)

export async function quoteSwap(connection: Connection, market: Market, side: 'buy' | 'sell', amountIn: BN): Promise<Quote> {
    const dbc = new DynamicBondingCurveClient(connection, 'confirmed')
    const currentPoint = await withRetry(() => getCurrentPoint(connection, market.config.activationType))
    const quote = dbc.pool.swapQuote2({
        virtualPool: market.pool,
        config: market.config,
        swapBaseForQuote: side === 'sell',
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint,
        slippageBps: SLIPPAGE_BPS,
        swapMode: SwapMode.PartialFill,
        amountIn,
    })
    return {
        outputAmount: quote.outputAmount,
        minimumAmountOut: quote.minimumAmountOut ?? withSlippage(quote.outputAmount),
        tradingFee: quote.tradingFee,
        spent: quote.includedFeeInputAmount,
        // Not the SDK's amountLeft, which counts the remainder after a fee the program never takes
        // on it: the swap transfers only the fee-included input it uses, so the rest stays put.
        unspent: BN.max(new BN(0), amountIn.sub(quote.includedFeeInputAmount)),
    }
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
        dbc.pool.swap2({ owner, pool, swapBaseForQuote: side === 'sell', referralTokenAccount: null, swapMode: SwapMode.PartialFill, amountIn, minimumAmountOut })
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
    quote?: Quote
): Promise<string> {
    const priced = quote ?? (await quoteSwap(connection, await loadMarket(connection, pool), side, amountIn))
    const tx = await swapTransaction(connection, owner, pool, side, amountIn, priced.minimumAmountOut)
    return sendWithWallet(connection, tx, owner, send)
}

export const lamports = (sol: number) => new BN(Math.floor(sol * 1e9).toString())
