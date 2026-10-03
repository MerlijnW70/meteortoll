import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AnchorProvider, type Idl, Program, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, SystemInstruction } from '@solana/web3.js'
import { DAMM_V2, dammEventAuthority, dammPoolAuthority, positionSweeps, type ProblemAccount, PROBLEM_SPACE, submissionCreate, SUBMISSION_HEADER, TOKEN_PROGRAM_ID, TOLL, tollIdl, treasuryPools } from './toll.js'

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
    assert.deepEqual(filters, [[{ dataSize: PROBLEM_SPACE }, { memcmp: { offset: 8, bytes: launchpad.toBase58() } }]])
    assert.deepEqual(
        pools.map(({ label, pool }) => [label, pool.toBase58()]),
        [
            ['2x2x2r7', knownPool.toBase58()],
            [web.toBase58(), webPool.toBase58()],
        ]
    )
})

test('position sweeps', async () => {
    const toll = new Program(tollIdl as Idl, new AnchorProvider(new Connection('http://localhost:1'), new Wallet(Keypair.generate()), {}))
    const problem = key()
    const account = { baseVault: key(), quoteVault: key(), baseMint: key(), quoteMint: key() } as ProblemAccount
    const positions = [0, 1].map(() => ({ position: key(), positionNftAccount: key(), dammPool: key(), dammBaseVault: key(), dammQuoteVault: key() }))
    assert.deepEqual(await positionSweeps(toll, problem, account, []), [])
    const ixs = await positionSweeps(toll, problem, account, positions)
    assert.equal(ixs.length, 2)
    ixs.forEach((ix, i) => {
        const p = positions[i]
        assert.ok(ix.programId.equals(TOLL))
        assert.deepEqual([...ix.data.subarray(0, 8)], [146, 252, 74, 129, 200, 102, 151, 90])
        assert.deepEqual(
            ix.keys.map((k) => k.pubkey.toBase58()),
            [problem, dammPoolAuthority, p.dammPool, p.position, p.positionNftAccount, account.baseVault, account.quoteVault, p.dammBaseVault, p.dammQuoteVault, account.baseMint, account.quoteMint, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, dammEventAuthority, DAMM_V2].map((k) => k.toBase58())
        )
    })
})
