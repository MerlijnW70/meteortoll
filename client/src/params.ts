// The launchpad's DBC config, built with Meteora's own curve helpers. Profiles differ only in
// market caps (in quote units): `test` graduates after a small buy in LiteSVM, `devnet` after a
// fraction of a SOL, `mainnet` is the launch setting.

import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithMarketCap,
    CollectFeeMode,
    type ConfigParameters,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
} from '@meteora-ag/dynamic-bonding-curve-sdk'

export const PROFILES = {
    test: { initialMarketCap: 10, migrationMarketCap: 50 },
    devnet: { initialMarketCap: 0.2, migrationMarketCap: 1 },
    // Graduation has to be reachable during the launch itself: that is when the DAMM v2 half of the
    // integration shows. params.test.ts holds the SOL it takes.
    mainnet: { initialMarketCap: 10, migrationMarketCap: 50 },
} as const

export type Profile = keyof typeof PROFILES

export function launchParams(profile: Profile): ConfigParameters {
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
            baseFeeParams: {
                baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 },
            },
            dynamicFeeEnabled: false,
            collectFeeMode: CollectFeeMode.QuoteToken,
            // Every trading fee the protocol leaves goes to the pool creator: the problem's bounty.
            creatorTradingFeePercentage: 100,
            poolCreationFee: 0,
            enableFirstSwapWithMinFee: false,
        },
        migration: {
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        },
        // The creator's DAMM v2 position is locked forever, and its fees keep feeding the bounty.
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
