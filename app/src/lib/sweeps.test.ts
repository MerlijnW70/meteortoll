import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NATIVE_MINT } from '@solana/spl-token'
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { DAMM_V2, type ProblemAccount } from '@meteortoll/core'
import { tollReader } from './chain'
import { claimGroup } from './solve/build'
import { BUDGET_ROOM, pack, PACKET, planDbcSweeps, positionNfts, sweepInstructions, tokenAccountAmount } from './sweeps'

const key = () => Keypair.generate().publicKey
const big = (n: bigint) => ({ toString: () => n.toString() })
const pool = (fees: { base?: bigint; quote?: bigint }, reserve: bigint, surplusTaken = false) => ({
    creator_base_fee: big(fees.base ?? 0n),
    creator_quote_fee: big(fees.quote ?? 0n),
    quote_reserve: big(reserve),
    is_creator_withdraw_surplus: surplusTaken ? 1 : 0,
})

test('trading fees are swept whenever the curve holds creator fees, before or after graduation', () => {
    assert.equal(planDbcSweeps(pool({ quote: 5n }, 0n), 100n).trading, true)
    assert.equal(planDbcSweeps(pool({ base: 5n }, 0n), 100n).trading, true)
    assert.equal(planDbcSweeps(pool({}, 0n), 100n).trading, false)
})

test('the surplus is swept once the curve is complete, and only once', () => {
    assert.equal(planDbcSweeps(pool({}, 99n), 100n).surplus, false)
    assert.equal(planDbcSweeps(pool({}, 100n), 100n).surplus, true)
    assert.equal(planDbcSweeps(pool({}, 150n, true), 100n).surplus, false)
})

/// SPL token account data: mint, owner, amount.
function tokenAccount(mint: PublicKey, owner: PublicKey, amount: bigint): Uint8Array {
    const data = new Uint8Array(165)
    data.set(mint.toBytes(), 0)
    data.set(owner.toBytes(), 32)
    new DataView(data.buffer).setBigUint64(64, amount, true)
    return data
}
const nftAccountOf = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('position_nft_account'), mint.toBuffer()], DAMM_V2)[0]

test("a position NFT counts only at DAMM v2's address for it and only while held", () => {
    const problem = key()
    const nft = key()
    const found = positionNfts([{ pubkey: nftAccountOf(nft), data: tokenAccount(nft, problem, 1n) }])
    assert.equal(found.length, 1)
    assert.ok(found[0].mint.equals(nft))
    assert.equal(positionNfts([{ pubkey: key(), data: tokenAccount(nft, problem, 1n) }]).length, 0, 'any other token account')
    assert.equal(positionNfts([{ pubkey: nftAccountOf(nft), data: tokenAccount(nft, problem, 0n) }]).length, 0, 'NFT no longer held')
    assert.equal(positionNfts([{ pubkey: nftAccountOf(nft), data: new Uint8Array(40) }]).length, 0, 'not a token account')
})

test('a token account amount reads from the SPL layout', () => {
    assert.equal(tokenAccountAmount(tokenAccount(key(), key(), 123_456n)), 123_456n)
    assert.equal(tokenAccountAmount(null), 0n)
})

test('all three sweeps and a full claim pack into packets with room for the fee, claim kept whole and last', async () => {
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

test('a group too large for any transaction is refused, not sent', () => {
    const huge = Array.from({ length: 40 }, () => SystemProgram.transfer({ fromPubkey: key(), toPubkey: key(), lamports: 1 }))
    assert.throws(() => pack([huge], key()), /does not fit one transaction/)
})

test('empty groups are skipped and small ones share a transaction', () => {
    const payer = key()
    const transfer = () => [SystemProgram.transfer({ fromPubkey: payer, toPubkey: key(), lamports: 1 })]
    assert.equal(pack([[], transfer(), transfer()], payer).length, 1)
    assert.equal(pack([], payer).length, 0)
})
