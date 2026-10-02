import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DBC_CONFIGS, dbcConfigFor, LAUNCHPADS, launchpadFor, parseCluster } from './config'
import devnet from '../../../client/state/devnet.json'

test('default cluster', () => {
    assert.equal(parseCluster(undefined), 'devnet')
    assert.equal(parseCluster(''), 'devnet')
})

test('unknown cluster', () => {
    assert.throws(() => parseCluster('mainnet-beta'), /use one of devnet, mainnet/)
    assert.equal(parseCluster('mainnet'), 'mainnet')
})

test('launchpad override', () => {
    assert.equal(launchpadFor('devnet', undefined).toBase58(), LAUNCHPADS.devnet)
    const other = '11111111111111111111111111111111'
    assert.equal(launchpadFor('devnet', other).toBase58(), other)
})

test('legacy override', () => {
    assert.throws(() => launchpadFor('mainnet', undefined, LAUNCHPADS.devnet), /use NEXT_PUBLIC_MAINNET_LAUNCHPAD/)
})

test('missing launchpad', () => {
    if (LAUNCHPADS.mainnet) return
    assert.throws(() => launchpadFor('mainnet', undefined), /no launchpad is known for mainnet/)
    assert.throws(() => launchpadFor('mainnet', ''), /no launchpad is known for mainnet/)
})

test('pinned config', () => {
    assert.equal(LAUNCHPADS.devnet, devnet.launchpad)
    assert.equal(dbcConfigFor('devnet', undefined)?.toBase58(), devnet.config)
    assert.equal(dbcConfigFor('mainnet', undefined)?.toBase58() ?? null, DBC_CONFIGS.mainnet ?? null)
    const other = '11111111111111111111111111111111'
    assert.equal(dbcConfigFor('devnet', other)?.toBase58(), other)
})
