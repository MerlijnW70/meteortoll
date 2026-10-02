import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DBC, TOLL } from '@meteortoll/core'
import { describeError, failureFromStatus, ProgramFailure } from './errors'

const SYSTEM = { toBase58: () => '11111111111111111111111111111111' } as never

test('wallet rejection', () => {
    const rejected = Object.assign(new Error('User rejected the request.'), { name: 'WalletSignTransactionError' })
    assert.equal(describeError(rejected).kind, 'cancelled')
})

test('codes per program', () => {
    const fromToll = describeError(failureFromStatus({ InstructionError: [0, { Custom: 6002 }] }, [TOLL]))
    const fromDbc = describeError(failureFromStatus({ InstructionError: [1, { Custom: 6002 }] }, [TOLL, DBC]))
    assert.equal(fromToll.title, 'The mint does not match the pool')
    assert.equal(fromDbc.kind, 'slippage')
    assert.match(fromDbc.title, /price moved/)
})

test('dbc error from logs', () => {
    const logs = ['Program log: AnchorError thrown in programs/dynamic-bonding-curve/src/state/virtual_pool.rs:596. Error Code: InsufficientLiquidity. Error Number: 6033. Error Message: Liquidity in bonding curve is insufficient.']
    const friendly = describeError(new ProgramFailure('failed', undefined, undefined, logs))
    assert.equal(friendly.title, 'The curve does not have that much left')
})

test('toll error', () => {
    const friendly = describeError(failureFromStatus({ InstructionError: [0, { Custom: 6004 }] }, [TOLL], [], 'sig123'))
    assert.equal(friendly.title, 'This problem already has a verified scheme')
    assert.equal(friendly.signature, 'sig123')
})

test('unknown code', () => {
    const friendly = describeError(failureFromStatus({ InstructionError: [0, { Custom: 9999 }] }, [DBC]))
    assert.equal(friendly.kind, 'unknown')
})

test('out of sol', () => {
    const logs = ['Transfer: insufficient lamports 1000, need 50000000', 'Program 11111111111111111111111111111111 failed: custom program error: 0x1']
    assert.equal(describeError(failureFromStatus({ InstructionError: [0, { Custom: 1 }] }, [SYSTEM], logs)).kind, 'funds')
    assert.equal(describeError(new Error('Attempt to debit an account but found no record of a prior credit.')).kind, 'funds')
    assert.equal(describeError(failureFromStatus('AccountNotFound', [])).kind, 'funds')
    assert.equal(describeError(failureFromStatus({ InsufficientFundsForRent: { account_index: 1 } }, [])).kind, 'funds')
})

test('network errors', () => {
    assert.equal(describeError(new Error('429 Too Many Requests')).kind, 'busy')
    assert.equal(describeError(new Error('Signature abc has expired: block height exceeded.')).kind, 'expired')
    assert.equal(describeError(new TypeError('Failed to fetch')).kind, 'network')
})

test('sdk quote error', () => {
    assert.equal(describeError(new Error('Insufficient Liquidity')).title, 'The curve does not have that much left')
})

test('other errors', () => {
    const friendly = describeError(new Error('x'.repeat(1000)))
    assert.equal(friendly.kind, 'unknown')
    assert.ok((friendly.detail ?? '').length <= 241)
})

test('launch window error', async () => {
    const { LaunchWindowError } = await import('./trade')
    const friendly = describeError(new LaunchWindowError(42.4, 75))
    assert.equal(friendly.title, 'The fee is high right after launch')
    assert.match(friendly.detail!, /42% right now and falls to 1% in about 75 s/)
    assert.equal(friendly.kind, 'cancelled')
})
