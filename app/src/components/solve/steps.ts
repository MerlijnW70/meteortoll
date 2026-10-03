import { type AttemptStatus, BOND_LAMPORTS } from '@meteortoll/core'

export type Step = 'commit' | 'upload' | 'reveal' | 'verify' | 'grace' | 'claim'

export const BOND_SOL = Number(BOND_LAMPORTS) / 1e9

export const STEPS: [Step, string, string][] = [
    ['commit', 'Commit and stake', `Posts a hash of your scheme and a ${BOND_SOL} SOL bond. Nobody can read the scheme yet.`],
    ['upload', 'Upload', 'Writes the scheme into its buffer. One approval covers the upload, reveal and verification.'],
    ['reveal', 'Reveal', 'Proves the upload matches the commitment and fixes the random test point.'],
    ['verify', 'Verify on-chain', 'The program checks the scheme at that point.'],
    ['grace', 'Grace window', 'An earlier commitment that also holds could still take the solve.'],
    ['claim', 'Claim', 'Takes the prize and returns your bond and buffer rent.'],
]

export const ORDER = STEPS.map(([step]) => step)

export function currentStep(status: AttemptStatus | null, won: boolean, final: boolean): Step {
    if (!status) return won ? 'claim' : 'commit'
    if (status === 'committed') return 'upload'
    if (status === 'revealed') return 'verify'
    if (status === 'holds' && won && !final) return 'grace'
    return 'claim'
}

export type StepState = 'done' | 'current' | 'failed' | 'todo'

export const isClaimed = (status: AttemptStatus | null, won: boolean, claimSent: boolean) => claimSent || (won && !status)

export function stepState(step: Step, current: Step, failed: boolean, claimed: boolean): StepState {
    const index = ORDER.indexOf(step)
    const at = ORDER.indexOf(current)
    if (failed && step === 'verify') return 'failed'
    if (index < at || (step === 'claim' && claimed)) return 'done'
    return index === at ? 'current' : 'todo'
}
