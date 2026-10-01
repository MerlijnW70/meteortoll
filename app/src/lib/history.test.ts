import { test } from 'node:test'
import assert from 'node:assert/strict'
import { utils } from '@coral-xyz/anchor'
import { type HistoryEvent, type InnerInstructions, paidOut, transferredOut } from './history'

// The devnet transaction that claimed ⟨7×7×9 : ≤314⟩ (3GJZco1D…): a sweep that fills the bounty
// vault (instruction 0), then the claim that empties it (instruction 3). Account keys and inner
// instructions as the RPC returned them.
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const VAULT = '9rj8mHYvCEQxxeEBXv73y8ufEbAmKNcWbB8ZsBtL2gBq'
const keys = [
    'AgRjCmb9Uoq2fobgxYszMaN2HhcoMiSAp9SoDoXKrfaS',
    '4kbE4JWujU7M28JcumdwJqXABjZtvzbt656gGCuK7MJM',
    '6Jnyh7GinuxKLR2sdq9A4N5e3vuAizyRy3JeD4HMWnea',
    '7zSv5YQqsdvxAtKpkBiA6WcbivNp4bjKoArLzqc1RpBL',
    '8Duzc4WSbA9otgZUvKBf3nb5XLhHfMdQfWqBJAaX5M6Y',
    '9AMbechjJg3FAotknEhpBDtKXKVssmvCXNb33PDTdQb3',
    VAULT,
    'ABkU5X9wvDLxVMEqn1UnoyUmzQuT579j7D9gji815dDq',
    'DTWAtHSXZBjFpYC3JE4aPvJnseBVya7t4pCvAfyUqsSW',
    'Ftb374Yr6VUhLUaNJrjyhmVpMz4n4qCDT2D7GQPKWEUc',
    'HRDEKzRa49D5hwPJG4xTpQdfV43Et2xXTJrAHhQqLvcR',
    '11111111111111111111111111111111',
    '3YjxqTwQnqSs8xMZ8TGz5S3gEJcG7qmvP5a6Y1bNJ5ey',
    '8Ks12pbrD6PXxfty1hVQiE9sc289zgU1zHkvXhrSdriF',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'BYc724Dx9n5duSZpZPYHLMXen5D5FVbSZB6dvNHi7np9',
    'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN',
    'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM',
    'So11111111111111111111111111111111111111112',
    TOKEN,
]
const inner: InnerInstructions[] = [
    {
        index: 0,
        instructions: [
            { accounts: [17, 3, 4, 6, 7, 5, 15, 18, 9, 19, 19, 13, 16], data: '8Z98emhHcaeZ15SzaAN5becgH7sWLDtrA', programIdIndex: 16 },
            { accounts: [5, 18, 6, 17], data: 'hjXBddZ6GytY8', programIdIndex: 19 },
        ],
    },
    { index: 3, instructions: [{ accounts: [6, 18, 1, 9], data: 'hjXBddZ6GytY8', programIdIndex: 19 }] },
]

test('the devnet claim paid out 0.0004 SOL from the bounty vault', () => {
    assert.equal(transferredOut(keys, inner, 3, VAULT), 400_000n)
})

test('the sweep in the same transaction fills the vault and pays nothing out of it', () => {
    assert.equal(transferredOut(keys, inner, 0, VAULT), 0n)
})

test('transfers out of other accounts, or by other programs, do not count', () => {
    assert.equal(transferredOut(keys, inner, 3, keys[5]), 0n)
    const notToken = [{ index: 3, instructions: [{ ...inner[1].instructions[0], programIdIndex: 16 }] }]
    assert.equal(transferredOut(keys, notToken, 3, VAULT), 0n)
    assert.equal(transferredOut(keys, null, 3, VAULT), 0n)
})

test('plain Transfer counts as well as TransferChecked, and other token instructions do not', () => {
    const amount = new Uint8Array(new BigUint64Array([123n]).buffer)
    const encode = (tag: number) => utils.bytes.bs58.encode(Uint8Array.from([tag, ...amount]))
    const group = (tag: number) => [{ index: 1, instructions: [{ accounts: [6, 1, 9], data: encode(tag), programIdIndex: 19 }] }]
    assert.equal(transferredOut(keys, group(3), 1, VAULT), 123n)
    assert.equal(transferredOut(keys, group(7), 1, VAULT), 0n) // MintTo
})

test('paid out sums the claims only', () => {
    const event = (kind: HistoryEvent['kind'], lamports?: bigint): HistoryEvent => ({ kind, signature: '', slot: 0, time: null, actor: '', lamports })
    assert.equal(paidOut([event('claim', 700n), event('sweep'), event('claim', 300n), event('claim')]), 1000n)
    assert.equal(paidOut([]), 0n)
})
