import type { PublicKey } from '@solana/web3.js'

interface U64 {
    toNumber(): number
    toString(): string
}

export interface ProblemAccount {
    launchpad: PublicKey
    pool: PublicKey
    baseMint: PublicKey
    quoteMint: PublicKey
    baseVault: PublicKey
    quoteVault: PublicKey
    n1: number
    n2: number
    n3: number
    targetRank: number
    solver: PublicKey | null
    solvedRank: number
    solverCommitSlot: U64
    solvedAtSlot: U64
    graceSlots: U64
    attempts: number
}

export interface AttemptAccount {
    problem: PublicKey
    solver: PublicKey
    commitment: number[]
    committedSlot: U64
    submission: PublicKey
    seedSlot: U64
    status: Record<string, object>
    bond: U64
}

export type AttemptStatus = 'committed' | 'revealed' | 'holds' | 'fails'

export const statusName = (status: Record<string, object>) => Object.keys(status)[0] as AttemptStatus

export type ProblemPhase = 'open' | 'grace' | 'solved'

export function problemPhase(problem: ProblemAccount, slot: number): ProblemPhase {
    if (!problem.solver) return 'open'
    return slot >= problem.solvedAtSlot.toNumber() + problem.graceSlots.toNumber() ? 'solved' : 'grace'
}
