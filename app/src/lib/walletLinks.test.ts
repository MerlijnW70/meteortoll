import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INSTALL_LINKS, isMobile, openInLinks } from './walletLinks'

test('phones', () => {
    assert.equal(isMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), true)
    assert.equal(isMobile('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'), true)
    assert.equal(isMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'), false)
})

test('open in', () => {
    const links = openInLinks('https://meteortoll.xyz/p/abc?tab=solve')
    assert.deepEqual(
        links.map((l) => l.href),
        [
            'https://phantom.app/ul/browse/https%3A%2F%2Fmeteortoll.xyz%2Fp%2Fabc%3Ftab%3Dsolve?ref=https%3A%2F%2Fmeteortoll.xyz',
            'https://solflare.com/ul/v1/browse/https%3A%2F%2Fmeteortoll.xyz%2Fp%2Fabc%3Ftab%3Dsolve?ref=https%3A%2F%2Fmeteortoll.xyz',
            'https://metamask.app.link/dapp/meteortoll.xyz/p/abc?tab=solve',
        ]
    )
})

test('install links', () => {
    assert.deepEqual(INSTALL_LINKS.map((l) => l.name), ['Phantom', 'Solflare', 'MetaMask'])
    for (const link of INSTALL_LINKS) assert.match(link.href, /^https:\/\//)
})
