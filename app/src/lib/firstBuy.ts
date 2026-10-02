import BN from 'bn.js'
import { type PoolConfig, swapQuotePartialFill, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'

export const FIRST_BUY_PRESETS = [0, 0.1, 0.5, 1] as const

export interface FirstBuyQuote {
    tokens: BN
    bounty: BN
    spent: BN
    curveShare: number
    supplyShare: number
}

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

export function quoteFirstBuy(config: PoolConfig, amountIn: BN, point: BN): FirstBuyQuote {
    const minFee = Number(config.enableFirstSwapWithMinFee) === 1
    const quote = swapQuotePartialFill(freshPool(config, point), config, false, amountIn, 0, false, point, minFee)
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

export function parseSol(text: string): BN | null {
    const match = /^(\d*)(?:\.(\d{0,9}))?$/.exec(text.trim())
    if (!match || (match[1] === '' && !match[2])) return null
    return new BN(match[1] || '0').mul(new BN(1_000_000_000)).add(new BN((match[2] ?? '').padEnd(9, '0')))
}
