import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metadataUri } from './site.js'

test('metadata uri', () => {
    assert.equal(metadataUri('https://meteortoll.vercel.app', 'Mint111'), 'https://meteortoll.vercel.app/api/metadata/Mint111')
    assert.equal(metadataUri('https://meteortoll.vercel.app/', 'Mint111'), 'https://meteortoll.vercel.app/api/metadata/Mint111')
})
