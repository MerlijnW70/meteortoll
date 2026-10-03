import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, type Connection } from '@solana/web3.js'
import { assertCluster, clusterOf, deployCost, GENESIS, LAUNCH_LAMPORTS, launchLamports, PROGRAM_DATA_HEADER, profileProblem, programDataMatches, siteProblem, statementProblem, upgradeAuthority } from './preflight.js'

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

test('cluster guard', async () => {
    const at = (genesis: string) => ({ getGenesisHash: async () => genesis }) as unknown as Connection
    await assertCluster(at(GENESIS.devnet), 'devnet')
    await assertCluster(at(GENESIS.mainnet), 'mainnet')
    await assertCluster(at('abc'), 'localnet')
    await assert.rejects(assertCluster(at(GENESIS.mainnet), 'devnet'), /TOLL_CLUSTER is devnet but the RPC serves mainnet/)
    await assert.rejects(assertCluster(at(GENESIS.devnet), 'mainnet'), /serves devnet/)
    await assert.rejects(assertCluster(at(GENESIS.mainnet), 'localnet'), /serves mainnet/)
    await assert.rejects(assertCluster(at('abc'), 'mainnet'), /unknown \(abc\)/)
    await assert.rejects(assertCluster(at('abc'), 'devnet'), /unknown \(abc\)/)
})

test('profile guard', async () => {
    const at = (genesis: string) => ({ getGenesisHash: async () => genesis }) as unknown as Connection
    await assertCluster(at('abc'), 'localnet', 'mainnet')
    await assertCluster(at(GENESIS.mainnet), 'mainnet', 'mainnet')
    await assert.rejects(assertCluster(at(GENESIS.devnet), 'devnet', 'mainnet'), /TOLL_PROFILE mainnet is only honoured on a local cluster/)
    await assert.rejects(assertCluster(at(GENESIS.mainnet), 'mainnet', 'devnet'), /TOLL_PROFILE devnet/)
    await assert.rejects(assertCluster(at(GENESIS.mainnet), 'localnet', 'mainnet'), /serves mainnet/)
    assert.equal(profileProblem('abc', 'localnet', 'mainnet'), 'TOLL_PROFILE mainnet is only honoured on a local cluster; TOLL_CLUSTER is localnet and the RPC serves abc')
    assert.equal(profileProblem('unknown (abc)', 'localnet', 'mainnet'), null)
    assert.equal(profileProblem('devnet', 'devnet', 'devnet'), null)
    assert.match(profileProblem('unknown (abc)', 'devnet', 'mainnet')!, /TOLL_CLUSTER is devnet/)
})

test('launch fee counted', () => {
    assert.equal(launchLamports(0), LAUNCH_LAMPORTS)
    assert.equal(launchLamports(0.05), LAUNCH_LAMPORTS + 50_000_000)
})

test('statement limits', () => {
    assert.equal(statementProblem([7, 7, 9], 314), null)
    assert.match(statementProblem([256, 2, 2], 600)!, /1 to 255/)
    assert.match(statementProblem([40, 40, 40], 1_600)!, /too large/)
    assert.match(statementProblem([2, 2, 2], 3)!, /target/)
    assert.match(statementProblem([2, 2, 2], 8)!, /target/)
})

test('statement edges', () => {
    assert.equal(statementProblem([32, 32, 48], 1_536), null)
    assert.match(statementProblem([255, 1, 1], 255)!, /target must be from 255 to 254/)
    assert.match(statementProblem([1, 4, 4], 16)!, /target must be from 16 to 15/)
    for (const [n, low, high] of [
        [[2, 3, 5], 15, 29],
        [[5, 2, 3], 15, 29],
        [[3, 5, 2], 15, 29],
    ] as [number[], number, number][]) {
        assert.equal(statementProblem(n, low), null)
        assert.equal(statementProblem(n, high), null)
        assert.equal(statementProblem(n, low - 1), `the target must be from ${low} to ${high}`)
        assert.equal(statementProblem(n, high + 1), `the target must be from ${low} to ${high}`)
    }
})

test('mainnet uri', () => {
    assert.equal(siteProblem('http://localhost:3000/api/metadata/x', false), null)
    assert.match(siteProblem('http://localhost:3000/api/metadata/x', true)!, /https/)
    assert.equal(siteProblem('https://meteortoll.vercel.app/api/metadata/x', true), null)
    assert.match(siteProblem('not a url', true)!, /not a URL/)
})
