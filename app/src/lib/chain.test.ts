import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor'
import BN from 'bn.js'
import { type AccountInfo, type Connection, Keypair, PublicKey } from '@solana/web3.js'
import { DBC, KIND_MATRIX, PROBLEM_SPACE, TOLL, tollIdl } from '@meteortoll/core'
import { decodeProblem, fetchProblems, ProblemNotFoundError } from './chain'
import { LAUNCHPAD } from './config'
import { dbcIdl } from './dbc'
import { metadataAddress } from './metaplex'

const key = () => Keypair.generate().publicKey
const tollCoder = new BorshAccountsCoder(tollIdl as Idl)
const dbcCoder = new BorshAccountsCoder(dbcIdl)
const RENT = PROBLEM_SPACE * 1000

const info = (owner: PublicKey, data: Buffer, lamports = 1): AccountInfo<Buffer> => ({ owner, data, lamports, executable: false, rentEpoch: 0 })

function dbcAccount(name: string, edit: (decoded: Record<string, unknown>) => void): Buffer {
    const discriminator = (dbcIdl.accounts ?? []).find((a) => a.name === name)!.discriminator
    const zero = Buffer.alloc(2048)
    zero.set(discriminator, 0)
    const decoded = dbcCoder.decode(name, zero) as Record<string, unknown>
    edit(decoded)
    const data = Buffer.alloc(2048)
    data.set(discriminator, 0)
    const layouts = (dbcCoder as unknown as { accountLayouts: Map<string, { layout: { encode(value: unknown, buffer: Buffer, offset: number): number } }> }).accountLayouts
    layouts.get(name)!.layout.encode(decoded, data, discriminator.length)
    return data
}

function tokenData(amount: bigint, length: number): Buffer {
    const data = Buffer.alloc(length)
    data.writeBigUInt64LE(amount, 64)
    return data
}

function metadata(name: string, symbol: string): Buffer {
    const field = (text: string) => {
        const bytes = Buffer.from(text)
        const length = Buffer.alloc(4)
        length.writeUInt32LE(bytes.length)
        return Buffer.concat([length, bytes])
    }
    return Buffer.concat([Buffer.alloc(65), field(name), field(symbol), field('')])
}

async function problemData(pool: PublicKey, quoteVault: PublicKey, baseMint: PublicKey, solver: PublicKey | null): Promise<Buffer> {
    const data = Buffer.alloc(PROBLEM_SPACE)
    const encoded = await tollCoder.encode('Problem', {
        launchpad: LAUNCHPAD,
        pool,
        base_mint: baseMint,
        quote_mint: key(),
        base_vault: key(),
        quote_vault: quoteVault,
        n1: 7,
        n2: 7,
        n3: 9,
        target_rank: 314,
        solver,
        solved_rank: 0,
        solver_commit_slot: new BN(0),
        solved_at_slot: new BN(100),
        grace_slots: new BN(150),
        attempts: 0,
        pending: 0,
        bump: 255,
        kind: KIND_MATRIX,
        reserved: Array(64).fill(0),
    })
    encoded.copy(data)
    return data
}

test('problem views', async () => {
    const [a, b, c] = [key(), key(), key()]
    const [poolA, poolB, poolC] = [key(), key(), key()]
    const [vaultA, vaultB, vaultC] = [key(), key(), key()]
    const [mintA, mintB, mintC] = [key(), key(), key()]
    const configA = key()
    const pool = (config: PublicKey, reserve: number, fee: number, migrated: number) =>
        dbcAccount('VirtualPool', (d) => {
            const state = d.pool_state as Record<string, unknown>
            state.config = config
            state.quote_reserve = new BN(reserve)
            state.creator_quote_fee = new BN(fee)
            state.is_migrated = migrated
            state.sqrt_price = new BN(2).pow(new BN(64))
        })
    const accounts = new Map<string, AccountInfo<Buffer>>([
        [poolA.toBase58(), info(DBC, await pool(configA, 50, 7, 0))],
        [poolB.toBase58(), info(DBC, await pool(key(), 30, 0, 1))],
        [configA.toBase58(), info(DBC, await dbcAccount('PoolConfig', (d) => (d.migration_quote_threshold = new BN(100))))],
        [vaultA.toBase58(), info(key(), tokenData(1000n, 72))],
        [vaultB.toBase58(), info(key(), tokenData(2000n, 165))],
        [metadataAddress(mintB).toBase58(), info(key(), metadata('Beta', 'BET'))],
        [a.toBase58(), info(TOLL, await problemData(poolA, vaultA, mintA, null), RENT + 500)],
        [b.toBase58(), info(TOLL, await problemData(poolB, vaultB, mintB, key()), RENT - 10)],
        [c.toBase58(), info(TOLL, await problemData(poolC, vaultC, mintC, null), RENT + 3)],
    ])
    const pages: number[] = []
    const connection = {
        getProgramAccounts: async () => [a, b, c].map((pubkey) => ({ pubkey, account: accounts.get(pubkey.toBase58())! })),
        getSlot: async () => 1000,
        getMinimumBalanceForRentExemption: async (size: number) => size * 1000,
        getMultipleAccountsInfo: async (keys: PublicKey[]) => {
            pages.push(keys.length)
            return keys.map((k) => accounts.get(k.toBase58()) ?? null)
        },
    } as unknown as Connection
    const views = await fetchProblems(connection)
    assert.deepEqual(
        views.map((v) => [v.address, v.info.name, v.vaultLamports, v.bondsLamports, v.unsweptLamports, v.curveProgress, v.graduated, v.priceSol, v.graceEndsAtSlot]),
        [
            [a.toBase58(), '7×7×9 rank ≤ 314', 1000n, 500n, 7n, 0.5, false, 0.001, null],
            [b.toBase58(), 'Beta', 2000n, 0n, 0n, 0, true, null, 250],
            [c.toBase58(), '7×7×9 rank ≤ 314', 0n, 3n, 0n, 0, false, null, null],
        ]
    )
    assert.deepEqual(pages, [12, 2])
})

test('no problems', async () => {
    const pages: number[] = []
    const connection = {
        getProgramAccounts: async () => [],
        getSlot: async () => 1,
        getMinimumBalanceForRentExemption: async () => 0,
        getMultipleAccountsInfo: async (keys: PublicKey[]) => {
            pages.push(keys.length)
            return keys.map(() => null)
        },
    } as unknown as Connection
    assert.deepEqual(await fetchProblems(connection), [])
    assert.deepEqual(pages, [])
})

test('paged reads', async () => {
    const problems = await Promise.all(Array.from({ length: 26 }, async () => [key(), await problemData(key(), key(), key(), null)] as const))
    const pages: number[] = []
    const connection = {
        getProgramAccounts: async () => problems.map(([pubkey, data]) => ({ pubkey, account: info(TOLL, data) })),
        getSlot: async () => 1,
        getMinimumBalanceForRentExemption: async () => 0,
        getMultipleAccountsInfo: async (keys: PublicKey[]) => {
            pages.push(keys.length)
            return keys.map(() => null)
        },
    } as unknown as Connection
    assert.equal((await fetchProblems(connection)).length, 26)
    assert.deepEqual(pages, [100, 4])
})

test('foreign program', async () => {
    const data = await problemData(key(), key(), key(), null)
    assert.equal(decodeProblem('x', info(TOLL, data), {} as Connection).targetRank, 314)
    assert.throws(() => decodeProblem('x', info(key(), data), {} as Connection), ProblemNotFoundError)
})
