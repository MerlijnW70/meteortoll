import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FILE_BYTES, MAX_SCHEME_BYTES } from './checkFile'
import { MAX_BATCH, MAX_BODY_BYTES } from './proxyLimits'
import { SLIPPAGE_BPS } from './trade'

const KIB = 1024
const MIB = 1024 * KIB

test('stated limits', () => {
    assert.equal(MAX_BODY_BYTES % KIB, 0)
    assert.equal(MAX_FILE_BYTES % MIB, 0)
    assert.equal(MAX_SCHEME_BYTES % MIB, 0)
    console.log(`fact: proxy body limit ${MAX_BODY_BYTES / KIB} KiB`)
    console.log(`fact: proxy batch limit ${MAX_BATCH} calls`)
    console.log(`fact: scheme file limit ${MAX_FILE_BYTES / MIB} MiB`)
    console.log(`fact: encoded scheme limit ${MAX_SCHEME_BYTES / MIB} MiB`)
    console.log(`fact: swap slippage limit ${SLIPPAGE_BPS / 100}%`)
})
