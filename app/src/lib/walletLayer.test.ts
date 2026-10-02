import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WalletNotConnectedError } from '@solana/wallet-adapter-base'
import { hasStoredWallet, idleWallet } from '../components/wallet/WalletLayer'

const store = (value: string | null) => ({ getItem: () => value })

test('stored wallet', () => {
    assert.equal(hasStoredWallet(store('"Phantom"')), true)
    assert.equal(hasStoredWallet(store('null')), false)
    assert.equal(hasStoredWallet(store(null)), false)
    assert.equal(hasStoredWallet(store('{bad')), false)
    assert.equal(hasStoredWallet(undefined), false)
    assert.equal(hasStoredWallet({ getItem: () => { throw new Error('blocked') } }), false)
})

test('idle wallet', async () => {
    let woken = 0
    const wallet = idleWallet(() => woken++)
    assert.equal(wallet.publicKey, null)
    assert.equal(wallet.connected, false)
    assert.deepEqual(wallet.wallets, [])
    wallet.select(null)
    await assert.rejects(wallet.connect(), WalletNotConnectedError)
    assert.equal(woken, 2)
    await assert.rejects(wallet.sendTransaction({} as never, {} as never), WalletNotConnectedError)
    await wallet.disconnect()
    assert.equal(woken, 2)
})
