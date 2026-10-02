import { PROTOCOL_FEE_PERCENT } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { type Economics, feeSplit, launchWindowText, percentOfTrade } from '@meteortoll/core'
import all from '../../../problems/economics.json'
import { CLUSTER } from './config'

export const ECONOMICS: Economics = (all as Record<string, Economics>)[CLUSTER]

export const SPLIT = feeSplit(ECONOMICS, PROTOCOL_FEE_PERCENT)
export const BOUNTY_SHARE = percentOfTrade(SPLIT.bounty)
export const TREASURY_SHARE = percentOfTrade(SPLIT.treasury)
export const PROTOCOL_SHARE = percentOfTrade(SPLIT.protocol)
export const HAS_TREASURY = ECONOMICS.treasurySharePercent > 0
export const LAUNCH_FEE_SOL = ECONOMICS.launchFeeSol
export const LAUNCH_WINDOW = ECONOMICS.launchWindow ?? null
export const LAUNCH_WINDOW_TEXT = LAUNCH_WINDOW ? launchWindowText(LAUNCH_WINDOW) : null
