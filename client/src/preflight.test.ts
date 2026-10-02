import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, type Connection } from '@solana/web3.js'
import { clusterOf, deployCost, GENESIS, PROGRAM_DATA_HEADER, programDataMatches, upgradeAuthority } from './preflight.js'

function programData(body: number[], authority: Uint8Array | null, padding = 0): Uint8Array {
    const data = new Uint8Array(PROGRAM_DATA_HEADER + body.length + padding)
    data[0] = 3
    if (authority) {
        data[12] = 1
        data.set(authority, 13)
    }
    data.set(body, PROGRAM_DATA_HEADER)
    return data
}

test('program matches', () => {
    const local = Uint8Array.from([1, 2, 3, 4])
    assert.ok(programDataMatches(programData([1, 2, 3, 4], null), local))
    assert.ok(programDataMatches(programData([1, 2, 3, 4], null, 100), local))
})

test('mismatch', () => {
    const local = Uint8Array.from([1, 2, 3, 4])
    assert.ok(!programDataMatches(programData([1, 2, 3, 5], null), local))
    assert.ok(!programDataMatches(programData([1, 2, 3], null), local))
    assert.ok(!programDataMatches(programData([1, 2, 3, 4, 9], null), local))
})

test('upgrade authority', () => {
    const key = Keypair.generate().publicKey
    assert.ok(upgradeAuthority(programData([1], key.toBytes()))?.equals(key))
    assert.equal(upgradeAuthority(programData([1], null)), null)
})

test('deploy cost', () => {
    const rent = (bytes: number) => (bytes + 128) * 6960
    const cost = deployCost(334_552, rent)
    assert.equal(cost.peak - cost.kept, rent(37 + 334_552))
    assert.ok(cost.kept > rent(45 + 334_552))
    assert.ok(cost.peak / 1e9 > 4.6 && cost.peak / 1e9 < 4.8, `peak ${cost.peak / 1e9}`)
})

test('exact cost', () => {
    assert.deepEqual(deployCost(1000, (bytes) => bytes), { peak: 1037 + 1045 + 36 + 5000, kept: 1045 + 36 + 5000 })
})

test('cluster name', async () => {
    const at = (genesis: string) => ({ getGenesisHash: async () => genesis }) as unknown as Connection
    assert.equal(await clusterOf(at(GENESIS.devnet)), 'devnet')
    assert.equal(await clusterOf(at(GENESIS.mainnet)), 'mainnet')
    assert.equal(await clusterOf(at('abc')), 'unknown (abc)')
})
