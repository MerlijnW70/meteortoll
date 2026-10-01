export interface Economics {
    treasurySharePercent: number
    launchFeeSol: number
    launchWindow?: LaunchWindow | null
}

export interface LaunchWindow {
    startingFeeBps: number
    endingFeeBps: number
    numberOfPeriod: number
    totalDurationSlots: number
}

export const SLOT_SECONDS = 0.4
export const MAX_FEE_BPS = 9900

export const MAX_TREASURY_SHARE_PERCENT = 50
export const MIN_LAUNCH_FEE_SOL = 0.001
export const MAX_LAUNCH_FEE_SOL = 100
export const TRADE_FEE_PERCENT = 1

export function economicsProblem(economics: Economics): string | null {
    const { treasurySharePercent: share, launchFeeSol: fee } = economics
    if (!Number.isInteger(share) || share < 0 || share > MAX_TREASURY_SHARE_PERCENT) return `treasurySharePercent must be a whole number from 0 to ${MAX_TREASURY_SHARE_PERCENT}`
    if (!Number.isFinite(fee) || fee < 0 || (fee > 0 && (fee < MIN_LAUNCH_FEE_SOL || fee > MAX_LAUNCH_FEE_SOL)))
        return `launchFeeSol must be 0 or from ${MIN_LAUNCH_FEE_SOL} to ${MAX_LAUNCH_FEE_SOL}`
    return launchWindowProblem(economics.launchWindow ?? null)
}

export function launchWindowProblem(window: LaunchWindow | null): string | null {
    if (!window) return null
    const { startingFeeBps: start, endingFeeBps: end, numberOfPeriod: periods, totalDurationSlots: slots } = window
    if (end !== TRADE_FEE_PERCENT * 100) return `launchWindow.endingFeeBps must be ${TRADE_FEE_PERCENT * 100}, the normal trading fee`
    if (!Number.isInteger(start) || start <= end || start > MAX_FEE_BPS) return `launchWindow.startingFeeBps must be a whole number above ${end} and at most ${MAX_FEE_BPS}`
    if (!Number.isInteger(periods) || periods < 1 || periods > 1000) return 'launchWindow.numberOfPeriod must be a whole number from 1 to 1000'
    if (!Number.isInteger(slots) || slots < periods || slots % periods !== 0) return 'launchWindow.totalDurationSlots must be a whole multiple of numberOfPeriod'
    return null
}

export function launchWindowText(window: LaunchWindow): string {
    const minutes = (window.totalDurationSlots * SLOT_SECONDS) / 60
    const duration = minutes < 1.5 ? `${Math.round(minutes * 60)} seconds` : `${Math.round(minutes)} minutes`
    return `${window.startingFeeBps / 100}% falling to ${window.endingFeeBps / 100}% over about ${duration}`
}

export const creatorTradingFeePercentage = (economics: Economics) => 100 - economics.treasurySharePercent

export interface FeeSplit {
    protocol: number
    treasury: number
    bounty: number
}

export function feeSplit(economics: Economics, protocolFeePercent: number): FeeSplit {
    const protocol = (TRADE_FEE_PERCENT * protocolFeePercent) / 100
    const rest = TRADE_FEE_PERCENT - protocol
    const treasury = (rest * economics.treasurySharePercent) / 100
    return { protocol, treasury, bounty: rest - treasury }
}

export const percentOfTrade = (value: number) => `${Number(value.toFixed(4))}%`
