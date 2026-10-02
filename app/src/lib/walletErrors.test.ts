import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walletErrorMessage } from './walletErrors'

const error = (name: string, message = '') => ({ name, message })

test('a declined connection says so, naming the wallet', () => {
    assert.equal(walletErrorMessage(error('WalletConnectionError', 'User rejected the request.'), 'MetaMask'), 'The connection was declined in MetaMask.')
})

test('a connection that returns no Solana account explains where to look', () => {
    assert.match(walletErrorMessage(error('WalletConnectionError', 'Unexpected error'), 'MetaMask')!, /Solana account/)
    assert.match(walletErrorMessage(error('WalletAccountError'), 'MetaMask')!, /Solana account/)
})

test('a locked or missing wallet, and a closed window, each get their own words', () => {
    assert.match(walletErrorMessage(error('WalletConnectionError', 'Wallet is locked'), 'MetaMask')!, /locked/)
    assert.match(walletErrorMessage(error('WalletNotReadyError'), 'Phantom')!, /not available/)
    assert.match(walletErrorMessage(error('WalletWindowClosedError'))!, /window was closed/)
})

test('a disconnect is not an error to show, and anything else shows its message', () => {
    assert.equal(walletErrorMessage(error('WalletDisconnectedError')), null)
    assert.equal(walletErrorMessage(error('WalletSignTransactionError', 'boom'), 'X'), 'Could not connect X: boom')
})
