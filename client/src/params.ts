import {
    ActivationType,
    BaseFeeMode,
    type BaseFeeParams,
    buildCurveWithMarketCap,
    CollectFeeMode,
    type ConfigParameters,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { creatorTradingFeePercentage, type Economics, economicsProblem, type LaunchWindow } from '@meteortoll/core'

export const PROFILES = {
    test: { initialMarketCap: 10, migrationMarketCap: 50 },
    devnet: { initialMarketCap: 0.2, migrationMarketCap: 1 },
    mainnet: { initialMarketCap: 10, migrationMarketCap: 50 },
} as const

export type Profile = keyof typeof PROFILES

const NONE: Economics = { treasurySharePercent: 0, launchFeeSol: 0 }

function launchFee(window: LaunchWindow | null): BaseFeeParams {
    if (!window) {
        return { baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const, feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 } }
    }
    return {
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential as const,
        feeSchedulerParam: {
            startingFeeBps: window.startingFeeBps,
            endingFeeBps: window.endingFeeBps,
            numberOfPeriod: window.numberOfPeriod,
            totalDuration: window.totalDurationSlots,
        },
    }
}

export function launchParams(profile: Profile, economics: Economics = NONE): ConfigParameters {
    const problem = economicsProblem(economics)
    if (problem) throw new Error(`problems/economics.json: ${problem}`)
    return buildCurveWithMarketCap({
        token: {
            tokenType: TokenType.SPLToken,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            tokenAuthorityOption: TokenAuthorityOption.Immutable,
            totalTokenSupply: 1_000_000_000,
            leftover: 0,
        },
        fee: {
            baseFeeParams: launchFee(economics.launchWindow ?? null),
            dynamicFeeEnabled: false,
            collectFeeMode: CollectFeeMode.QuoteToken,
            creatorTradingFeePercentage: creatorTradingFeePercentage(economics),
            poolCreationFee: economics.launchFeeSol,
            enableFirstSwapWithMinFee: !!economics.launchWindow,
        },
        migration: {
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        },
        liquidityDistribution: {
            partnerLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 0,
            creatorLiquidityPercentage: 0,
            creatorPermanentLockedLiquidityPercentage: 100,
        },
        lockedVesting: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
        activationType: ActivationType.Slot,
        ...PROFILES[profile],
    })
}
