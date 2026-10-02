import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import BN from 'bn.js'
import { Connection } from '@solana/web3.js'
import { createDbcProgram, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { parseSol, quoteFirstBuy } from './firstBuy'

// The test config's account, saved by programs/toll/tests/dbc.rs (SAVE_CONFIG_FIXTURE=1), and
// what a first buy of one quote token got there on-chain.
const FIRST_BUY_TOKENS = '91734610085185'
const FIRST_BUY_FEE = '8000000'
const ONE = new BN(1_000_000_000)

function testConfig(): PoolConfig {
    const hex = readFileSync(new URL('../../../programs/toll/tests/fixtures/dbc_config_account_test.hex', import.meta.url), 'utf8').trim()
    const { program } = createDbcProgram(new Connection('http://127.0.0.1:8899'))
    return program.coder.accounts.decode('poolConfig', Buffer.from(hex, 'hex')) as PoolConfig
}

test('a first buy is priced exactly as the pool program filled it', () => {
    const quote = quoteFirstBuy(testConfig(), ONE, new BN(0))
    assert.equal(quote.tokens.toString(), FIRST_BUY_TOKENS)
    assert.equal(quote.bounty.toString(), FIRST_BUY_FEE)
    assert.equal(quote.spent.toString(), ONE.toString())
    assert.equal(quote.supplyShare, 91734610085185 / 1e15)
})

test('the price does not depend on when the pool opens', () => {
    const config = testConfig()
    assert.equal(quoteFirstBuy(config, ONE, new BN(123_456_789)).tokens.toString(), FIRST_BUY_TOKENS)
})

test('a first buy fills part of the curve, and a huge one stops where the curve ends', () => {
    const config = testConfig()
    const small = quoteFirstBuy(config, ONE, new BN(0))
    assert.ok(small.curveShare > 0 && small.curveShare < 1)
    const huge = quoteFirstBuy(config, ONE.muln(10_000), new BN(0))
    assert.equal(huge.curveShare, 1)
    assert.ok(huge.spent.lt(ONE.muln(10_000)), 'the rest of a huge buy stays in the wallet')
})

test('typed SOL amounts become exact lamports', () => {
    const cases: [string, string | null][] = [
        ['1', '1000000000'],
        ['0.1', '100000000'],
        ['.5', '500000000'],
        ['2.', '2000000000'],
        ['0.000000001', '1'],
        [' 3 ', '3000000000'],
        ['0.0000000001', null],
        ['', null],
        ['.', null],
        ['1,5', null],
        ['-1', null],
        ['1e3', null],
    ]
    for (const [text, expected] of cases) assert.equal(parseSol(text)?.toString() ?? null, expected, text)
})
