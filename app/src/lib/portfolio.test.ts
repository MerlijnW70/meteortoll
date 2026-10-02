import { test } from 'node:test'
import assert from 'node:assert/strict'
import BN from 'bn.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { type AccountInfo, type Connection, PublicKey } from '@solana/web3.js'
import { attemptAddress, TOLL } from '@meteortoll/core'
import { type ProblemView, tollReader } from './chain'
import { fetchPortfolio } from './portfolio'

const key = (n: number) => new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? n : 7)))
const owner = PublicKey.findProgramAddressSync([Buffer.from('owner')], TOLL)[0]
const other = key(250)

const problem = (n: number, phase: ProblemView['phase'], priceSol: number | null, solver: PublicKey | null = null) =>
    ({ address: key(n).toBase58(), account: { baseMint: key(100 + n), solver }, phase, priceSol }) as unknown as ProblemView

const tokenData = (amount: bigint, length = 165) => {
    const data = Buffer.alloc(length)
    data.writeBigUInt64LE(amount, 64)
    return data
}

const fake = (accounts: Map<string, Buffer>) => {
    const pages: number[] = []
    const connection = {
        getBalance: async () => 7,
        getMultipleAccountsInfo: async (page: PublicKey[]) => {
            pages.push(page.length)
            return page.map((k) => {
                const data = accounts.get(k.toBase58())
                return data ? ({ data, lamports: 1, owner: TOLL, executable: false } as AccountInfo<Buffer>) : null
            })
        },
    } as unknown as Connection
    return { connection, pages }
}

const ata = (p: ProblemView) => getAssociatedTokenAddressSync(p.account.baseMint, owner, true).toBase58()

test('positions', async () => {
    const problems = [
        problem(1, 'open', 0.5),
        problem(2, 'open', null),
        problem(3, 'solved', 1, owner),
        problem(4, 'solved', 1, other),
        problem(5, 'open', 1, owner),
        problem(6, 'open', 2),
        problem(7, 'open', 1),
    ]
    const accounts = new Map<string, Buffer>()
    const { connection, pages } = fake(accounts)
    const attempt = await tollReader(connection).coder.accounts.encode('attempt', {
        problem: key(2),
        solver: owner,
        commitment: Array(32).fill(0),
        committedSlot: new BN(1),
        submission: key(9),
        seedSlot: new BN(2),
        status: { committed: {} },
        check: Array(60).fill(0),
        bond: new BN(3),
        bump: 255,
    })
    accounts.set(ata(problems[0]), tokenData(2_000_000n))
    accounts.set(attemptAddress(key(2), owner).toBase58(), attempt)
    accounts.set(ata(problems[5]), tokenData(3n, 72))
    accounts.set(ata(problems[6]), tokenData(0n))
    const portfolio = await fetchPortfolio(connection, owner, problems)
    assert.equal(portfolio.lamports, 7n)
    assert.deepEqual(pages, [14])
    assert.deepEqual(
        portfolio.positions.map((p) => [p.problem.address, p.tokens, p.valueSol, p.attempt?.bond.toString() ?? null, p.claimable]),
        [
            [key(1).toBase58(), 2_000_000n, 1, null, false],
            [key(2).toBase58(), 0n, null, '3', false],
            [key(3).toBase58(), 0n, 0, null, true],
            [key(6).toBase58(), 3n, 0.000006, null, false],
        ]
    )
})

test('paged lookups', async () => {
    const run = async (count: number) => {
        const { connection, pages } = fake(new Map())
        const problems = Array.from({ length: count }, (_, i) => problem(i, 'open', null))
        const portfolio = await fetchPortfolio(connection, owner, problems)
        assert.deepEqual(portfolio.positions, [])
        return pages
    }
    assert.deepEqual(await run(50), [100])
    assert.deepEqual(await run(60), [100, 20])
})

test('paged amounts', async () => {
    const problems = Array.from({ length: 60 }, (_, i) => problem(i, 'open', null))
    const accounts = new Map([[ata(problems[59]), tokenData(5n)]])
    const { connection } = fake(accounts)
    const portfolio = await fetchPortfolio(connection, owner, problems)
    assert.deepEqual(portfolio.positions.map((p) => p.tokens), [5n])
})
