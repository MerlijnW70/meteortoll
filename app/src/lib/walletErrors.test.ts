import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walletErrorMessage } from './walletErrors'

const error = (name: string, message = '') => ({ name, message })

test('declined', () => {
    assert.equal(walletErrorMessage(error('WalletConnectionError', 'User rejected the request.'), 'MetaMask'), 'The connection was declined in MetaMask.')
})

test('no account', () => {
    assert.match(walletErrorMessage(error('WalletAccountError'), 'MetaMask')!, /Solana account/)
})

test('real cause', () => {
    assert.equal(walletErrorMessage(error('WalletConnectionError', 'Unexpected error'), 'MetaMask'), 'Could not connect MetaMask: Unexpected error')
    assert.match(walletErrorMessage(error('WalletConnectionError', 'Session timed out'), 'Mobile Wallet Adapter')!, /did not answer in time/)
})

test('locked or closed', () => {
    assert.match(walletErrorMessage(error('WalletConnectionError', 'Wallet is locked'), 'MetaMask')!, /locked/)
    assert.match(walletErrorMessage(error('WalletNotReadyError'), 'Phantom')!, /not available/)
    assert.match(walletErrorMessage(error('WalletWindowClosedError'))!, /window was closed/)
})

test('disconnect', () => {
    assert.equal(walletErrorMessage(error('WalletDisconnectedError')), null)
    assert.equal(walletErrorMessage(error('WalletSignTransactionError', 'boom'), 'X'), 'Could not connect X: boom')
})
