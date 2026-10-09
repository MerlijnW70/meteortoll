import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import { signAllOnChain } from './walletSign'

const owner = Keypair.generate()

const transfer = () => {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }))
    tx.feePayer = owner.publicKey
    tx.recentBlockhash = Keypair.generate().publicKey.toBase58()
    return tx
}

const standardAdapter = (seen: { chain: string }[]) => ({
    standard: true,
    wallet: {
        accounts: [{ address: owner.publicKey.toBase58() }],
        features: {
            'solana:signTransaction': {
                signTransaction: async (...inputs: { chain: string; transaction: Uint8Array }[]) =>
                    inputs.map((input) => {
                        seen.push(input)
                        const tx = Transaction.from(input.transaction)
                        tx.sign(owner)
                        return { signedTransaction: new Uint8Array(tx.serialize()) }
                    }),
            },
        },
    },
})

const unused = async () => {
    throw new Error('fallback used')
}

test('every transaction is signed for the site cluster', async () => {
    const seen: { chain: string }[] = []
    const signed = await signAllOnChain(standardAdapter(seen), owner.publicKey, unused, 'solana:devnet')([transfer(), transfer()])
    assert.deepEqual(
        seen.map((s) => s.chain),
        ['solana:devnet', 'solana:devnet']
    )
    assert.equal(signed.length, 2)
    assert.ok(signed.every((tx) => tx.verifySignatures()))
})

test('wallets without the standard feature use the adapter', async () => {
    const fallback = async (txs: Transaction[]) => txs
    assert.equal(signAllOnChain({ standard: false }, owner.publicKey, fallback), fallback)
    assert.equal(signAllOnChain(null, owner.publicKey, fallback), fallback)
})

test('an account the wallet does not hold uses the adapter', async () => {
    const fallback = async (txs: Transaction[]) => txs
    assert.equal(signAllOnChain(standardAdapter([]), Keypair.generate().publicKey, fallback), fallback)
})
