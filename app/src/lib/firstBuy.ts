// The launcher's optional first buy, priced before the pool exists. It goes in the transaction
// that creates the pool, so nobody can buy ahead of the launcher, and its trading fee is the
// bounty's first deposit (programs/toll/tests/dbc.rs holds both on-chain).

import BN from 'bn.js'
import { type PoolConfig, swapQuotePartialFill, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'

/// First-buy amounts offered as one-tap choices, in SOL.
export const FIRST_BUY_PRESETS = [0, 0.1, 0.5, 1] as const

export interface FirstBuyQuote {
    /// Tokens received, in base units.
    tokens: BN
    /// The trading fee, all of which goes to the problem's bounty.
    bounty: BN
    /// What leaves the wallet, fee included.
    spent: BN
    /// How far the buy fills the curve, from 0 to 1.
    curveShare: number
    /// The tokens' share of the whole supply, from 0 to 1.
    supplyShare: number
}

/// A pool as DBC creates it: at the config's start price, no reserves, active from `point`.
export function freshPool(config: PoolConfig, point: BN): VirtualPool {
    return {
        poolState: {
            sqrtPrice: config.sqrtStartPrice,
            quoteReserve: new BN(0),
            baseReserve: new BN(0),
            activationPoint: point,
            volatilityTracker: {
                lastUpdateTimestamp: new BN(0),
                padding: [],
                sqrtPriceReference: config.sqrtStartPrice,
                volatilityAccumulator: new BN(0),
                volatilityReference: new BN(0),
            },
        },
    } as unknown as VirtualPool
}

const ratio = (part: BN, whole: BN) => (whole.isZero() ? 0 : Math.min(1, Number(part.toString()) / Number(whole.toString())))

/// The first buy of `amountIn` quote units on a fresh pool of `config`, at `point`.
export function quoteFirstBuy(config: PoolConfig, amountIn: BN, point: BN): FirstBuyQuote {
    const quote = swapQuotePartialFill(freshPool(config, point), config, false, amountIn, 0, false, point, false)
    const reserve = quote.includedFeeInputAmount.sub(quote.tradingFee).sub(quote.protocolFee)
    const threshold = config.migrationQuoteThreshold
    const supply = config.preMigrationTokenSupply
    return {
        tokens: quote.outputAmount,
        bounty: quote.tradingFee,
        spent: quote.includedFeeInputAmount,
        curveShare: ratio(reserve, threshold),
        supplyShare: ratio(quote.outputAmount, supply),
    }
}

/// Lamports from an amount of SOL as typed: digits with at most nine decimals, or null.
export function parseSol(text: string): BN | null {
    const match = /^(\d*)(?:\.(\d{0,9}))?$/.exec(text.trim())
    if (!match || (match[1] === '' && !match[2])) return null
    return new BN(match[1] || '0').mul(new BN(1_000_000_000)).add(new BN((match[2] ?? '').padEnd(9, '0')))
}
