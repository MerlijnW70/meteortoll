import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorshCoder, type Idl } from '@coral-xyz/anchor'
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { TOLL, tollIdl } from '@meteortoll/core'
import { applyBudget, hasComputeBudget, MAX_PRICE, MAX_UNITS, priorityPrice, unitLimit } from './fees'
import { CHUNK } from './solve/build'

const PACKET = 1232
const key = () => Keypair.generate().publicKey
const transfer = () => SystemProgram.transfer({ fromPubkey: key(), toPubkey: key(), lamports: 1 })

test('percentile', () => {
    assert.equal(priorityPrice([0, 10, 20, 30, 40, 50, 60, 70]), 60)
    assert.equal(priorityPrice([5]), 5)
})

test('unsorted prices', () => {
    assert.equal(priorityPrice([70, 0, 40, 10, 60, 20, 50, 30]), 60)
    assert.equal(priorityPrice([9, 1, 5, 3]), 9)
})

test('no prices', () => {
    assert.equal(priorityPrice([]), 0)
    assert.equal(priorityPrice([0, 0, 0]), 0)
})

test('spike cap', () => {
    assert.equal(priorityPrice([MAX_PRICE * 10, MAX_PRICE * 20, MAX_PRICE * 30, MAX_PRICE * 40]), MAX_PRICE)
})

test('cap bound', () => {
    const lamports = (MAX_PRICE * MAX_UNITS) / 1e6
    assert.ok(lamports < 1_000_000, `${lamports} lamports`)
})

test('compute limit', () => {
    assert.ok(unitLimit(100_000) >= 120_000)
    assert.equal(unitLimit(10_000_000), MAX_UNITS)
    assert.ok(unitLimit(0) > 0)
})

test('budget order', () => {
    const tx = applyBudget(new Transaction().add(transfer()), { units: 1_000, price: 7 })
    assert.equal(tx.instructions.length, 3)
    assert.ok(tx.instructions[0].programId.equals(ComputeBudgetProgram.programId))
    assert.ok(tx.instructions[1].programId.equals(ComputeBudgetProgram.programId))
    assert.ok(tx.instructions[2].programId.equals(SystemProgram.programId))
})

test('zero price', () => {
    assert.equal(applyBudget(new Transaction().add(transfer()), { price: 0 }).instructions.length, 1)
    assert.equal(applyBudget(new Transaction().add(transfer()), { price: 3 }).instructions.length, 2)
})

test('existing budget', () => {
    const own = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2 })
    const tx = applyBudget(new Transaction().add(own, transfer()), { units: 1_000, price: 99 })
    assert.equal(tx.instructions.length, 2)
    assert.ok(hasComputeBudget(tx))
    assert.equal(tx.instructions[0], own)
})

test('upload chunk fits', () => {
    const coder = new BorshCoder(tollIdl as Idl)
    const data = coder.instruction.encode('write_submission', { offset: 0, bytes: Buffer.alloc(CHUNK, 0xff) })
    const write = new TransactionInstruction({
        programId: TOLL,
        keys: [
            { pubkey: key(), isSigner: true, isWritable: true },
            { pubkey: key(), isSigner: false, isWritable: false },
            { pubkey: key(), isSigner: false, isWritable: true },
        ],
        data,
    })
    const tx = applyBudget(new Transaction().add(write), { units: 50_000, price: MAX_PRICE })
    tx.feePayer = write.keys[0].pubkey
    tx.recentBlockhash = new PublicKey(new Uint8Array(32).fill(9)).toBase58()
    const size = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length
    assert.ok(size <= PACKET, `${size} bytes`)
})
