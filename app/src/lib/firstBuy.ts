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

export const bountyPart = (tradingFee: BN, creatorPercent: number) => tradingFee.muln(creatorPercent).divn(100)

const ratio = (part: BN, whole: BN) => (whole.isZero() ? 0 : Math.min(1, Number(part.toString()) / Number(whole.toString())))

export function quoteFirstBuy(config: PoolConfig, amountIn: BN, point: BN): FirstBuyQuote {
    const minFee = Number(config.enableFirstSwapWithMinFee) === 1
    const quote = swapQuotePartialFill(freshPool(config, point), config, false, amountIn, 0, false, point, minFee)
    const reserve = quote.includedFeeInputAmount.sub(quote.tradingFee).sub(quote.protocolFee)
    const threshold = config.migrationQuoteThreshold
    const supply = config.preMigrationTokenSupply
    return {
        tokens: quote.outputAmount,
        bounty: bountyPart(quote.tradingFee, config.creatorTradingFeePercentage),
        spent: quote.includedFeeInputAmount,
        curveShare: ratio(reserve, threshold),
        supplyShare: ratio(quote.outputAmount, supply),
    }
}

export function parseUnits(text: string, decimals: number): BN | null {
    const match = new RegExp(`^(\\d*)(?:\\.(\\d{0,${decimals}}))?$`).exec(text.trim())
    if (!match || (match[1] === '' && !match[2])) return null
    return new BN(match[1] || '0').mul(new BN(10).pow(new BN(decimals))).add(new BN((match[2] ?? '').padEnd(decimals, '0') || '0'))
}

export const parseSol = (text: string) => parseUnits(text, 9)

export function formatUnits(amount: bigint, decimals: number): string {
    const scale = 10n ** BigInt(decimals)
    const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
    return fraction ? `${amount / scale}.${fraction}` : String(amount / scale)
}

export const portion = (held: bigint, percent: number, decimals: number) => formatUnits((held * BigInt(percent)) / 100n, decimals)
