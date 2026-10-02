import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    type Commitment,
    ComputeBudgetProgram,
    Connection,
    Keypair,
    type Signer,
    Transaction,
    type TransactionInstruction,
    sendAndConfirmTransaction,
} from '@solana/web3.js'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(here, '../..')

export const CLUSTER = process.env.TOLL_CLUSTER ?? 'devnet'
const RPC = process.env.TOLL_RPC ?? (CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com')
const COMMITMENT: Commitment = 'confirmed'
export const connection = new Connection(RPC, COMMITMENT)

export function loadKeypair(path = process.env.TOLL_KEYPAIR ?? resolve(ROOT, `.keys/${CLUSTER}.json`)): Keypair {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))))
}

export interface ProblemRecord {
    problem: string
    pool: string
    baseMint: string
    statement: [number, number, number, number]
    name: string
    symbol: string
}

export interface State {
    config?: string
    launchpad?: string
    problems: Record<string, ProblemRecord>
}

const statePath = resolve(ROOT, `client/state/${CLUSTER}.json`)

export function loadState(): State {
    return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { problems: {} }
}

export function saveState(state: State) {
    mkdirSync(dirname(statePath), { recursive: true })
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
}

async function withRetry<T>(run: () => Promise<T>, attempts = 8): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await run()
        } catch (error) {
            const limited = String(error).includes('429')
            if (!limited || attempt >= attempts) throw error
            await new Promise((done) => setTimeout(done, 2000 * attempt))
        }
    }
}

export async function send(
    instructions: TransactionInstruction[],
    payer: Keypair,
    signers: Signer[] = [],
    computeUnits?: number
): Promise<string> {
    return withRetry(() => {
        const tx = new Transaction()
        if (computeUnits) tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }))
        tx.add(...instructions)
        return sendAndConfirmTransaction(connection, tx, [payer, ...signers], { commitment: COMMITMENT })
    })
}

export async function sendTx(tx: Transaction, payer: Keypair, signers: Signer[] = []): Promise<string> {
    return sendAndConfirmTransaction(connection, tx, [payer, ...signers], { commitment: COMMITMENT })
}

export async function waitForSlot(slot: number) {
    while ((await connection.getSlot(COMMITMENT)) < slot) {
        await new Promise((done) => setTimeout(done, 400))
    }
}

export function explorer(signature: string): string {
    const suffix = CLUSTER === 'mainnet' ? '' : `?cluster=${CLUSTER}`
    return `https://explorer.solana.com/tx/${signature}${suffix}`
}
