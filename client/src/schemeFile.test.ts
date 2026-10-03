import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodeScheme, type FmmScheme } from '@meteortoll/core'
import { readScheme } from './schemeFile'

const sample = (name: string) => fileURLToPath(new URL(`../../app/public/samples/${name}`, import.meta.url))

test('binary scheme', () => {
    assert.deepEqual(readScheme(sample('7x7x9-rank314.bin')), readFileSync(sample('7x7x9-rank314.bin')))
})

test('json scheme', () => {
    const encoded = Buffer.from(encodeScheme(JSON.parse(readFileSync(sample('strassen-2x2x2.json'), 'utf8')) as FmmScheme))
    assert.deepEqual(readScheme(sample('strassen-2x2x2.json')), encoded)
    assert.equal(encoded[0], 2)
})
