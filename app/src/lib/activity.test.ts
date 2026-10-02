import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorshCoder, type Idl, utils } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey, TransactionInstruction, TransactionMessage, type VersionedTransactionResponse } from '@solana/web3.js'
import { TOLL, tollIdl } from '@meteortoll/core'
import type { ProblemView } from './chain'
import { activityIn, bountyFunded, costBasis, fetchActivity } from './activity'

const buy = (lamports: bigint, tokens: bigint) => ({ kind: 'buy' as const, lamports, tokens })
const sell = (lamports: bigint, tokens: bigint) => ({ kind: 'sell' as const, lamports, tokens })

test('buys', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), buy(300n, 10n)]), { tokens: 20n, cost: 400n, realized: 0n })
})

test('sale at a profit', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), buy(300n, 10n), sell(150n, 5n)]), { tokens: 15n, cost: 300n, realized: 50n })
})

test('sale at a loss', () => {
    assert.deepEqual(costBasis([buy(200n, 10n), sell(50n, 10n)]), { tokens: 0n, cost: 0n, realized: -150n })
})

test('oversold tokens', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), sell(300n, 15n)]), { tokens: 0n, cost: 0n, realized: 200n })
    assert.deepEqual(costBasis([sell(40n, 4n)]), { tokens: 0n, cost: 0n, realized: 40n })
})

test('non-trades', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), { kind: 'claim', lamports: 999n }, { kind: 'commit' }]), { tokens: 10n, cost: 100n, realized: 0n })
})

test('bounty funded', () => {
    assert.equal(bountyFunded([{ kind: 'buy', fee: 8n } as never, { kind: 'sell', fee: 2n } as never, { kind: 'claim', lamports: 5n } as never]), 10n)
})

test('claimed tokens ignored', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), { kind: 'claim', lamports: 5n, tokens: 3n }]), { tokens: 10n, cost: 100n, realized: 0n })
})

test('empty sale', () => {
    assert.deepEqual(costBasis([buy(100n, 10n), sell(30n, 0n)]), { tokens: 10n, cost: 100n, realized: 0n })
})

const key = (n: number) => new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? n : 3)))
const coder = new BorshCoder(tollIdl as Idl)
const known = key(10)
const unknown = key(11)
const vault = key(12)
const solverQuote = key(13)
const payer = key(1)

const call = (name: string, args: object, accounts: PublicKey[]) =>
    new TransactionInstruction({ programId: TOLL, keys: accounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })), data: coder.instruction.encode(name, args) })

const claimAccounts = (problem: PublicKey) => [payer, problem, key(20), vault, key(21), solverQuote, key(22), key(23), TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID]
const commitAccounts = (problem: PublicKey) => [payer, problem, key(30), PublicKey.default]

function response(): VersionedTransactionResponse {
    const message = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: PublicKey.default.toBase58(),
        instructions: [
            call('commit', { commitment: Array(32).fill(1) }, commitAccounts(known)),
            call('claim', {}, claimAccounts(known)),
            call('reveal', { salt: Array(32).fill(2) }, [payer, known, key(30), key(31), key(32)]),
            call('commit', { commitment: Array(32).fill(1) }, commitAccounts(unknown)),
        ],
    }).compileToV0Message()
    const keys = message.staticAccountKeys.map((k) => k.toBase58())
    const index = (k: PublicKey) => keys.indexOf(k.toBase58())
    const amount = new Uint8Array(8)
    new DataView(amount.buffer).setBigUint64(0, 500n, true)
    const transfer = { programIdIndex: index(TOKEN_PROGRAM_ID), accounts: [index(vault), index(solverQuote)], data: utils.bytes.bs58.encode(Uint8Array.from([3, ...amount])) }
    return {
        transaction: { message, signatures: ['sig'] },
        meta: { innerInstructions: [{ index: 0, instructions: [transfer] }, { index: 1, instructions: [transfer] }], logMessages: [] },
        slot: 5,
        blockTime: 9,
    } as unknown as VersionedTransactionResponse
}

const problems = [{ address: known.toBase58(), account: { pool: key(40) } }] as unknown as ProblemView[]

test('toll calls', () => {
    const base = { signature: 'sig', time: 9, slot: 5, problem: known.toBase58() }
    assert.deepEqual(activityIn(response(), payer.toBase58(), problems), [
        { ...base, kind: 'commit', lamports: undefined },
        { ...base, kind: 'claim', lamports: 500n },
    ])
})

test('foreign payer', () => {
    assert.deepEqual(activityIn(response(), key(2).toBase58(), problems), [])
})

test('token history', async () => {
    const owner = PublicKey.unique()
    const mint = PublicKey.unique()
    const ata = getAssociatedTokenAddressSync(mint, owner, true)
    const asked: string[] = []
    const fetched: string[][] = []
    const connection = {
        getSignaturesForAddress: async (address: PublicKey) => {
            asked.push(address.toBase58())
            if (address.equals(owner)) return [{ signature: 'a', err: null }, { signature: 'b', err: null }]
            return [{ signature: 'b', err: null }, { signature: 'c', err: null }, { signature: 'd', err: {} }]
        },
        getTransactions: async (signatures: string[]) => {
            fetched.push(signatures)
            return []
        },
        getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map((k) => (k.equals(ata) ? {} : null)),
    }
    const list = [mint, PublicKey.unique()].map((baseMint) => ({ address: PublicKey.unique().toBase58(), account: { baseMint } })) as unknown as ProblemView[]
    assert.deepEqual(await fetchActivity(connection as never, owner, list), [])
    assert.deepEqual(asked.sort(), [owner.toBase58(), ata.toBase58()].sort())
    assert.deepEqual(fetched.flat().sort(), ['a', 'b', 'c'])
})

test('existing accounts only', async () => {
    const owner = PublicKey.unique()
    const batches: number[] = []
    const asked: string[] = []
    const mints = Array.from({ length: 150 }, () => PublicKey.unique())
    const held = getAssociatedTokenAddressSync(mints[120], owner, true)
    const connection = {
        getSignaturesForAddress: async (address: PublicKey) => {
            asked.push(address.toBase58())
            return []
        },
        getTransactions: async () => [],
        getMultipleAccountsInfo: async (keys: PublicKey[]) => {
            batches.push(keys.length)
            return keys.map((k) => (k.equals(held) ? {} : null))
        },
    }
    const list = mints.map((baseMint) => ({ address: PublicKey.unique().toBase58(), account: { baseMint } })) as unknown as ProblemView[]
    await fetchActivity(connection as never, owner, list)
    assert.deepEqual(batches, [100, 50])
    assert.deepEqual(asked.sort(), [owner.toBase58(), held.toBase58()].sort())
})
