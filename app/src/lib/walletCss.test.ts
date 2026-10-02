import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { localWalletCss } from './walletCss'

const require = createRequire(import.meta.url)
const upstream = readFileSync(require.resolve('@solana/wallet-adapter-react-ui/styles.css'), 'utf8')
const local = readFileSync(new URL('../styles/wallet-adapter.css', import.meta.url), 'utf8')

test('the wallet stylesheet copy matches the installed package, minus the Google font', () => {
    assert.equal(
        local,
        localWalletCss(upstream),
        'app/src/styles/wallet-adapter.css is stale: regenerate it with `node --experimental-strip-types app/scripts/wallet-css.mts` after upgrading the wallet adapter'
    )
})

test('the copy loads nothing from another origin', () => {
    // Loads, not mentions: the license notice names the upstream repository.
    assert.doesNotMatch(local, /@import|fonts\.googleapis|url\(\s*['"]?(https?:)?\/\//)
})

test('the copy carries the upstream license notice', () => {
    assert.match(local, /^\/\*[\s\S]*Apache License 2\.0[\s\S]*\*\//)
})
