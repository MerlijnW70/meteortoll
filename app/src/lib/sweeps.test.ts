import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NATIVE_MINT } from '@solana/spl-token'
import { type AccountInfo, Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DAMM_V2, DBC, type ProblemAccount } from '@meteortoll/core'
import { tollReader } from './chain'
import { claimGroup } from './solve/build'
import { BUDGET_ROOM, findPositions, pack, PACKET, planDbcSweeps, positionNfts, previewGain, productive, sweepInstructions, sweepPlan, tokenAccountAmount } from './sweeps'

const key = () => Keypair.generate().publicKey
const big = (n: bigint) => ({ toString: () => n.toString() })
const pool = (fees: { base?: bigint; quote?: bigint }, reserve: bigint, surplusTaken = false) => ({
    creator_base_fee: big(fees.base ?? 0n),
    creator_quote_fee: big(fees.quote ?? 0n),
    quote_reserve: big(reserve),
    is_creator_withdraw_surplus: surplusTaken ? 1 : 0,
})

test('trading fees', () => {
    assert.equal(planDbcSweeps(pool({ quote: 5n }, 0n), 100n).trading, true)
    assert.equal(planDbcSweeps(pool({ base: 5n }, 0n), 100n).trading, true)
    assert.equal(planDbcSweeps(pool({}, 0n), 100n).trading, false)
})

test('surplus', () => {
    assert.equal(planDbcSweeps(pool({}, 99n), 100n).surplus, false)
    assert.equal(planDbcSweeps(pool({}, 100n), 100n).surplus, true)
    assert.equal(planDbcSweeps(pool({}, 150n, true), 100n).surplus, false)
})

function tokenAccount(mint: PublicKey, owner: PublicKey, amount: bigint): Uint8Array {
    const data = new Uint8Array(165)
    data.set(mint.toBytes(), 0)
    data.set(owner.toBytes(), 32)
    new DataView(data.buffer).setBigUint64(64, amount, true)
    return data
}
const nftAccountOf = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('position_nft_account'), mint.toBuffer()], DAMM_V2)[0]

test('position nft', () => {
    const problem = key()
    const nft = key()
    const found = positionNfts([{ pubkey: nftAccountOf(nft), data: tokenAccount(nft, problem, 1n) }])
    assert.equal(found.length, 1)
    assert.ok(found[0].mint.equals(nft))
    assert.equal(positionNfts([{ pubkey: key(), data: tokenAccount(nft, problem, 1n) }]).length, 0, 'any other token account')
    assert.equal(positionNfts([{ pubkey: nftAccountOf(nft), data: tokenAccount(nft, problem, 0n) }]).length, 0, 'NFT no longer held')
    assert.equal(positionNfts([{ pubkey: nftAccountOf(nft), data: new Uint8Array(40) }]).length, 0, 'not a token account')
})

test('token amount', () => {
    assert.equal(tokenAccountAmount(tokenAccount(key(), key(), 123_456n)), 123_456n)
    assert.equal(tokenAccountAmount(null), 0n)
})

test('packing', async () => {
    const program = tollReader(new Connection('http://127.0.0.1:1'))
    const problemAddress = key()
    const solver = key()
    const problem = {
        pool: key(),
        baseMint: key(),
        quoteMint: NATIVE_MINT,
        baseVault: key(),
        quoteVault: key(),
    } as unknown as ProblemAccount
    const position = { position: key(), positionNftAccount: key(), dammPool: key(), dammBaseVault: key(), dammQuoteVault: key() }
    const state = { config: key(), base_vault: key(), quote_vault: key() } as never
    const sweeps = await sweepInstructions(program, problemAddress, problem, { trading: true, surplus: true, positions: [position], pool: state })
    assert.equal(sweeps.length, 3)
    const claim = await claimGroup(program, problemAddress, problem, solver, key())
    const txs = pack([...sweeps.map((ix) => [ix]), claim], solver)

    for (const tx of txs) {
        tx.feePayer = solver
        tx.recentBlockhash = PublicKey.default.toBase58()
        const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length
        assert.ok(bytes <= PACKET - BUDGET_ROOM, `${bytes} bytes`)
    }
    const order = txs.flatMap((tx) => tx.instructions)
    assert.deepEqual(order, [...sweeps, ...claim], 'instructions keep their order')
    const last = txs.at(-1)!.instructions
    assert.deepEqual(last.slice(-claim.length), claim, 'the claim group lands whole, in the last transaction')
    console.log(`fact: three sweeps and a claim pack into ${txs.length} transactions`)
})

test('oversized group', () => {
    const huge = Array.from({ length: 40 }, () => SystemProgram.transfer({ fromPubkey: key(), toPubkey: key(), lamports: 1 }))
    assert.throws(() => pack([huge], key()), /does not fit one transaction/)
})

test('small groups', () => {
    const payer = key()
    const transfer = () => [SystemProgram.transfer({ fromPubkey: payer, toPubkey: key(), lamports: 1 })]
    assert.equal(pack([[], transfer(), transfer()], payer).length, 1)
    assert.equal(pack([], payer).length, 0)
})

test('short token data', () => {
    const nft = key()
    const data = tokenAccount(nft, key(), 1n).slice(0, 72)
    assert.equal(positionNfts([{ pubkey: nftAccountOf(nft), data }]).length, 1)
    assert.equal(tokenAccountAmount(tokenAccount(key(), key(), 7n).slice(0, 72)), 7n)
    assert.equal(tokenAccountAmount(new Uint8Array(71)), 0n)
})

const positionOf = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('position'), mint.toBuffer()], DAMM_V2)[0]
const account = (owner: PublicKey, data: Uint8Array) => ({ owner, data: Buffer.from(data), lamports: 1, executable: false }) as AccountInfo<Buffer>

function positionData(dammPool: PublicKey, mint: PublicKey, length: number): Uint8Array {
    const data = new Uint8Array(Math.max(length, 72))
    data.set(dammPool.toBytes(), 8)
    data.set(mint.toBytes(), 40)
    return data.slice(0, length)
}

function chainOf(accounts: Map<string, AccountInfo<Buffer> | null>, tokenAccounts: { pubkey: PublicKey; account: { data: Buffer } }[] = []) {
    return {
        getTokenAccountsByOwner: async () => ({ value: tokenAccounts }),
        getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map((k) => accounts.get(k.toBase58()) ?? null),
        getAccountInfo: async (k: PublicKey) => accounts.get(k.toBase58()) ?? null,
    } as unknown as Connection
}

test('find positions', async () => {
    const problem = key()
    const [baseMint, quoteMint, dammPool] = [key(), key(), key()]
    const mints = Array.from({ length: 6 }, () => key())
    const tokenAccounts = mints.map((mint) => ({ pubkey: nftAccountOf(mint), account: { data: Buffer.from(tokenAccount(mint, problem, 1n)) } }))
    const accounts = new Map<string, AccountInfo<Buffer> | null>([
        [positionOf(mints[0]).toBase58(), account(DAMM_V2, positionData(dammPool, mints[0], 72))],
        [positionOf(mints[1]).toBase58(), account(DAMM_V2, positionData(dammPool, mints[1], 200))],
        [positionOf(mints[2]).toBase58(), account(key(), positionData(dammPool, mints[2], 200))],
        [positionOf(mints[3]).toBase58(), account(DAMM_V2, positionData(dammPool, mints[3], 71))],
        [positionOf(mints[4]).toBase58(), account(DAMM_V2, positionData(dammPool, key(), 200))],
    ])
    const found = await findPositions(chainOf(accounts, tokenAccounts), problem, baseMint, quoteMint)
    assert.deepEqual(
        found.map((f) => f.position.toBase58()),
        [positionOf(mints[0]).toBase58(), positionOf(mints[1]).toBase58()]
    )
    assert.ok(found[0].positionNftAccount.equals(nftAccountOf(mints[0])) && found[0].dammPool.equals(dammPool))
    const vault = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('token_vault'), mint.toBuffer(), dammPool.toBuffer()], DAMM_V2)[0]
    assert.ok(found[1].dammBaseVault.equals(vault(baseMint)) && found[1].dammQuoteVault.equals(vault(quoteMint)))
    assert.deepEqual(await findPositions(chainOf(new Map()), problem, baseMint, quoteMint), [])
})

const zeroed = (name: string) => {
    const discriminator = DynamicBondingCurveIdl.accounts.find((a) => a.name === name)!.discriminator
    const data = new Uint8Array(2048)
    data.set(discriminator, 0)
    return data
}

test('sweep plan', async () => {
    const problem = { pool: key(), baseMint: key(), quoteMint: key() } as unknown as ProblemAccount
    const none = await sweepPlan(chainOf(new Map()), key(), problem)
    assert.deepEqual({ trading: none.trading, surplus: none.surplus, pool: none.pool, positions: none.positions }, { trading: false, surplus: false, pool: null, positions: [] })
    const noConfig = await sweepPlan(chainOf(new Map([[problem.pool.toBase58(), account(DBC, zeroed('VirtualPool'))]])), key(), problem)
    assert.ok(noConfig.pool)
    assert.equal(noConfig.trading, false)
    assert.equal(noConfig.surplus, false)
    const configured = await sweepPlan(
        chainOf(
            new Map([
                [problem.pool.toBase58(), account(DBC, zeroed('VirtualPool'))],
                [PublicKey.default.toBase58(), account(DBC, zeroed('PoolConfig'))],
            ])
        ),
        key(),
        problem
    )
    assert.equal(configured.trading, false)
    assert.equal(configured.surplus, true)
})

test('no pool', async () => {
    const program = tollReader(new Connection('http://127.0.0.1:1'))
    const problem = { pool: key(), baseMint: key(), quoteMint: NATIVE_MINT, baseVault: key(), quoteVault: key() } as unknown as ProblemAccount
    assert.deepEqual(await sweepInstructions(program, key(), problem, { trading: true, surplus: true, positions: [], pool: null }), [])
})

const instruction = (length: number) => new TransactionInstruction({ programId: DAMM_V2, keys: [], data: Buffer.alloc(length) })

function bytes(ixs: TransactionInstruction[], payer: PublicKey) {
    const tx = new Transaction().add(...ixs)
    tx.feePayer = payer
    tx.recentBlockhash = PublicKey.default.toBase58()
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length
}

test('exact fit', () => {
    const payer = key()
    const limit = PACKET - BUDGET_ROOM
    const whole = 900 + limit - bytes([instruction(900)], payer)
    assert.equal(bytes([instruction(whole)], payer), limit)
    assert.equal(pack([[instruction(whole)]], payer).length, 1)
    assert.throws(() => pack([[instruction(whole + 1)]], payer), /does not fit/)
    const first = 900 + limit - bytes([instruction(900), instruction(10)], payer)
    assert.equal(pack([[instruction(first)], [instruction(10)]], payer).length, 1)
    assert.equal(pack([[instruction(first + 1)], [instruction(10)]], payer).length, 2)
})

const amount = (n: bigint) => ({ data: [Buffer.from(tokenAccount(key(), key(), n)).toString('base64'), 'base64'] })

function simulator(results: [bigint, bigint][]) {
    const vaults = { quote: key(), base: key() }
    const options: unknown[] = []
    let call = 0
    const connection = {
        getMultipleAccountsInfo: async () => [account(key(), tokenAccount(key(), key(), 10n)), account(key(), tokenAccount(key(), key(), 20n))],
        simulateTransaction: async (_tx: unknown, opts: unknown) => {
            options.push(opts)
            const [quote, base] = results[call++]
            return { value: { err: null, logs: [], accounts: [amount(quote), amount(base)] } }
        },
    } as unknown as Connection
    return { connection, vaults, options }
}

const transfer = () => SystemProgram.transfer({ fromPubkey: key(), toPubkey: key(), lamports: 1 })

test('preview gain', async () => {
    const { connection, vaults, options } = simulator([
        [15n, 23n],
        [17n, 20n],
    ])
    const txs = [new Transaction().add(transfer()), new Transaction().add(transfer())]
    assert.deepEqual(await previewGain(connection, txs, key(), vaults), { quote: 12n, base: 3n })
    assert.deepEqual(options[0], {
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses: [vaults.quote.toBase58(), vaults.base.toBase58()] },
    })
})

test('productive', async () => {
    const { connection, vaults } = simulator([
        [15n, 20n],
        [10n, 20n],
        [10n, 23n],
        [5n, 20n],
        [5n, 25n],
    ])
    const ixs = Array.from({ length: 5 }, transfer)
    assert.deepEqual(await productive(connection, ixs, key(), vaults), [ixs[0], ixs[2], ixs[4]])
    assert.deepEqual(await productive(connection, [], key(), vaults), [])
})
