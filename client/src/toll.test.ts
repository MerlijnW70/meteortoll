import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, SystemInstruction } from '@solana/web3.js'
import { submissionCreate, SUBMISSION_HEADER, TOLL, treasuryPools } from './toll.js'

const key = () => Keypair.generate().publicKey

test('submission space', () => {
    const ix = submissionCreate(key(), key(), 1_000, 5)
    const made = SystemInstruction.decodeCreateAccount(ix)
    assert.equal(made.space, SUBMISSION_HEADER + 1_000)
    assert.equal(made.lamports, 5)
    assert.ok(made.programId.equals(TOLL))
})

test('treasury pools', async () => {
    const launchpad = key()
    const [known, web, foreign] = [key(), key(), key()]
    const [knownPool, webPool, foreignPool] = [key(), key(), key()]
    const filters: unknown[] = []
    const toll = {
        account: {
            problem: {
                all: async (filter: unknown) => {
                    filters.push(filter)
                    return [
                        { publicKey: known, account: { launchpad, pool: knownPool } },
                        { publicKey: web, account: { launchpad, pool: webPool } },
                        { publicKey: foreign, account: { launchpad: key(), pool: foreignPool } },
                    ]
                },
            },
        },
    }
    const pools = await treasuryPools(toll as never, launchpad, { '2x2x2r7': { problem: known.toBase58() } })
    assert.deepEqual(filters, [[{ dataSize: 277 }, { memcmp: { offset: 8, bytes: launchpad.toBase58() } }]])
    assert.deepEqual(
        pools.map(({ label, pool }) => [label, pool.toBase58()]),
        [
            ['2x2x2r7', knownPool.toBase58()],
            [web.toBase58(), webPool.toBase58()],
        ]
    )
})
