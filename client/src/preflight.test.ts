import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { deployCost, PROGRAM_DATA_HEADER, programDataMatches, upgradeAuthority } from './preflight.js'

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

test('a deployed program matches the local binary, padding included', () => {
    const local = Uint8Array.from([1, 2, 3, 4])
    assert.ok(programDataMatches(programData([1, 2, 3, 4], null), local))
    assert.ok(programDataMatches(programData([1, 2, 3, 4], null, 100), local))
})

test('any other byte, a shorter program or non-zero padding is a mismatch', () => {
    const local = Uint8Array.from([1, 2, 3, 4])
    assert.ok(!programDataMatches(programData([1, 2, 3, 5], null), local))
    assert.ok(!programDataMatches(programData([1, 2, 3], null), local))
    assert.ok(!programDataMatches(programData([1, 2, 3, 4, 9], null), local))
})

test('the upgrade authority is read from the header, and none once revoked', () => {
    const key = Keypair.generate().publicKey
    assert.ok(upgradeAuthority(programData([1], key.toBytes()))?.equals(key))
    assert.equal(upgradeAuthority(programData([1], null)), null)
})

test('a deploy holds the buffer and the program data at once, and keeps the program data', () => {
    const rent = (bytes: number) => (bytes + 128) * 6960
    const cost = deployCost(334_552, rent)
    assert.equal(cost.peak - cost.kept, rent(37 + 334_552))
    assert.ok(cost.kept > rent(45 + 334_552))
    assert.ok(cost.peak / 1e9 > 4.6 && cost.peak / 1e9 < 4.8, `peak ${cost.peak / 1e9}`)
})
