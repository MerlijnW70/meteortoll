import BN from 'bn.js'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { type DynamicBondingCurveClient, getCurrentPoint, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'

export const SLIPPAGE_BPS = 100
export const MAX_FEE_PERCENT = 5

export interface BuyLimits {
    slippageBps: number
    maxFeePercent: number
}

export interface BuyQuote {
    outputAmount: BN
    minimumAmountOut: BN
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

export const withSlippage = (out: BN, slippageBps: number) => out.muln(10_000 - slippageBps).divn(10_000)

export function parseLimits(slippage: string, maxFee: string): BuyLimits {
    const slippagePercent = Number(slippage)
    const maxFeePercent = Number(maxFee)
    if (!Number.isFinite(slippagePercent) || slippagePercent < 0 || slippagePercent >= 100) throw new Error(`--slippage ${slippage} is not a percent below 100`)
    if (!Number.isFinite(maxFeePercent) || maxFeePercent < 0 || maxFeePercent > 100) throw new Error(`--max-fee ${maxFee} is not a percent`)
    return { slippageBps: Math.round(slippagePercent * 100), maxFeePercent }
}

export async function quoteBuy(dbc: DynamicBondingCurveClient, connection: Connection, pool: PublicKey, amountIn: BN, limits: BuyLimits): Promise<BuyQuote> {
    const state = await dbc.state.getPool(pool)
    if (!state) throw new Error('pool not found')
    const fields = state.poolState ?? (state as never)
    const config = await dbc.state.getPoolConfig(fields.config)
    if (!config) throw new Error('config not found')
    const currentPoint = await getCurrentPoint(connection, config.activationType)
    const quote = dbc.pool.swapQuote2({
        virtualPool: state,
        config,
        swapBaseForQuote: false,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint,
        slippageBps: limits.slippageBps,
        swapMode: SwapMode.PartialFill,
        amountIn,
    })
    const spent = quote.includedFeeInputAmount
    const fee = quote.tradingFee.add(quote.protocolFee)
    return {
        outputAmount: quote.outputAmount,
        minimumAmountOut: withSlippage(quote.outputAmount, limits.slippageBps),
        feePercent: spent.isZero() ? 0 : (Number(fee.toString()) / Number(spent.toString())) * 100,
        windowSlotsLeft: windowSlotsLeft(config.poolFees.baseFee, BigInt(fields.activationPoint.toString()), BigInt(currentPoint.toString())),
    }
}

export async function buyTransaction(dbc: DynamicBondingCurveClient, connection: Connection, owner: PublicKey, pool: PublicKey, amountIn: BN, limits: BuyLimits): Promise<{ tx: Transaction; quote: BuyQuote }> {
    const quote = await quoteBuy(dbc, connection, pool, amountIn, limits)
    if (quote.feePercent > limits.maxFeePercent) {
        const wait = quote.windowSlotsLeft ? `; the launch window ends in about ${Math.ceil(quote.windowSlotsLeft * 0.4)} s` : ''
        throw new Error(`the fee is ${quote.feePercent.toFixed(1)}%, above --max-fee ${limits.maxFeePercent}%${wait}`)
    }
    if (quote.minimumAmountOut.isZero()) throw new Error('the quote returns no tokens')
    const tx = await dbc.pool.swap2({ owner, pool, swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.PartialFill, amountIn, minimumAmountOut: quote.minimumAmountOut })
    return { tx, quote }
}
