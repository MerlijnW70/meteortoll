import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAUNCHPADS, launchpadFor, parseCluster } from './config'

test('the cluster defaults to devnet', () => {
    assert.equal(parseCluster(undefined), 'devnet')
    assert.equal(parseCluster(''), 'devnet')
})

test('a cluster name the app does not know is refused, not guessed', () => {
    assert.throws(() => parseCluster('mainnet-beta'), /use one of devnet, mainnet/)
    assert.equal(parseCluster('mainnet'), 'mainnet')
})

test("each cluster lists its own launchpad, and an override wins", () => {
    assert.equal(launchpadFor('devnet', undefined).toBase58(), LAUNCHPADS.devnet)
    const other = '11111111111111111111111111111111'
    assert.equal(launchpadFor('devnet', other).toBase58(), other)
})

test('the old cluster-less override is refused with the name to use instead', () => {
    assert.throws(() => launchpadFor('mainnet', undefined, LAUNCHPADS.devnet), /use NEXT_PUBLIC_MAINNET_LAUNCHPAD/)
})

test('a cluster without a launchpad refuses to start rather than borrow another', () => {
    if (LAUNCHPADS.mainnet) return
    assert.throws(() => launchpadFor('mainnet', undefined), /no launchpad is known for mainnet/)
    assert.throws(() => launchpadFor('mainnet', ''), /no launchpad is known for mainnet/)
})
