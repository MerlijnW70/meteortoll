import BN from 'bn.js'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, getCurrentPoint, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { bountyPart } from './firstBuy'
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

export interface Quote {
    outputAmount: BN
    minimumAmountOut: BN
    tradingFee: BN
    bounty: BN
    spent: BN
    unspent: BN
    feePercent: number
    windowSlotsLeft: number
}

export function windowSlotsLeft(baseFee: { baseFeeMode: number; firstFactor: number; secondFactor: { toString(): string } }, activationPoint: bigint, currentPoint: bigint): number {
    const scheduler = baseFee.baseFeeMode === 0 || baseFee.baseFeeMode === 1
    const periods = BigInt(baseFee.firstFactor)
    if (!scheduler || periods === 0n) return 0
    const end = activationPoint + periods * BigInt(baseFee.secondFactor.toString())
    return end > currentPoint ? Number(end - currentPoint) : 0
}

const feePercent = (fee: BN, total: BN) => (total.isZero() ? 0 : (Number(fee.toString()) / Number(total.toString())) * 100)

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
        bounty: bountyPart(quote.tradingFee, market.config.creatorTradingFeePercentage),
        spent: quote.includedFeeInputAmount,
        unspent: BN.max(new BN(0), amountIn.sub(quote.includedFeeInputAmount)),
        feePercent: feePercent(quote.tradingFee.add(quote.protocolFee), side === 'buy' ? quote.includedFeeInputAmount : quote.outputAmount.add(quote.tradingFee).add(quote.protocolFee)),
        windowSlotsLeft: windowSlotsLeft(market.config.poolFees.baseFee, BigInt(market.pool.poolState.activationPoint.toString()), BigInt(currentPoint.toString())),
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

export const windowSeconds = (slots: number) => Math.ceil(slots * 0.4)

export class LaunchWindowError extends Error {
    constructor(readonly feePercent: number, readonly secondsLeft: number) {
        super(`This token just launched: its fee is ${feePercent.toFixed(0)}% right now and falls to 1% in about ${secondsLeft} s. Open the problem page to see the fee before you buy, or wait.`)
        this.name = 'LaunchWindowError'
    }
}

export class PriceMovedError extends Error {
    constructor() {
        super('The price moved since your quote. Review the new quote and try again.')
        this.name = 'PriceMovedError'
    }
}

export async function executeSwap(
    connection: Connection,
    owner: PublicKey,
    send: WalletSend,
    pool: PublicKey,
    side: 'buy' | 'sell',
    amountIn: BN,
    quote?: Quote,
    maxFeePercent?: number
): Promise<string> {
    const fresh = await quoteSwap(connection, await loadMarket(connection, pool), side, amountIn)
    if (maxFeePercent !== undefined && fresh.feePercent > maxFeePercent) throw new LaunchWindowError(fresh.feePercent, windowSeconds(fresh.windowSlotsLeft))
    if (quote && fresh.outputAmount.lt(quote.minimumAmountOut)) throw new PriceMovedError()
    const tx = await swapTransaction(connection, owner, pool, side, amountIn, (quote ?? fresh).minimumAmountOut)
    return sendWithWallet(connection, tx, owner, send)
}

export const lamports = (sol: number) => new BN(Math.floor(sol * 1e9).toString())
