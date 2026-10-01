import { PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'
import idl from './idl/toll.json' with { type: 'json' }

export const TOLL = new PublicKey(idl.address)
export const DBC = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
export const DAMM_V2 = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG')
export const SUBMISSION_HEADER = 44

function constant(name: string): number {
    const found = (idl as { constants?: { name: string; value: string }[] }).constants?.find((c) => c.name === name)
    if (!found) throw new Error(`the toll IDL has no constant ${name}; rebuild the program and copy its IDL`)
    return Number(found.value)
}

export const BOND_LAMPORTS = constant('BOND_LAMPORTS')
export const MAX_SCHEME_LEN = constant('MAX_SCHEME_LEN')
export const VERIFY_BUDGET = constant('VERIFY_BUDGET')

const seed = (text: string) => Buffer.from(text)
const pda = (seeds: Uint8Array[], program = TOLL) => PublicKey.findProgramAddressSync(seeds, program)[0]

export const dbcPoolAuthority = pda([seed('pool_authority')], DBC)
export const dbcEventAuthority = pda([seed('__event_authority')], DBC)
export const dammPoolAuthority = pda([seed('pool_authority')], DAMM_V2)
export const dammEventAuthority = pda([seed('__event_authority')], DAMM_V2)

export const launchpadAddress = (admin: PublicKey) => pda([seed('launchpad'), admin.toBuffer()])

export function problemAddress(pool: PublicKey, n: [number, number, number], target: number): PublicKey {
    const targetBytes = Buffer.alloc(4)
    targetBytes.writeUInt32LE(target, 0)
    return pda([seed('problem'), pool.toBuffer(), Buffer.from(n), targetBytes])
}

export const vaultAddress = (problem: PublicKey, mint: PublicKey) => pda([seed('vault'), problem.toBuffer(), mint.toBuffer()])
export const attemptAddress = (problem: PublicKey, solver: PublicKey) =>
    pda([seed('attempt'), problem.toBuffer(), solver.toBuffer()])
