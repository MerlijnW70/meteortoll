import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { Connection, PublicKey } from '@solana/web3.js'
import { attemptAddress } from '@meteortoll/core'

const DEVNET_KEY = '../.keys/devnet.json'
const PROBLEM = process.env.LIVE_SOLVE_PROBLEM ?? ''

test('live solve', async ({ page }) => {
    test.skip(!PROBLEM || !existsSync(DEVNET_KEY), 'set LIVE_SOLVE_PROBLEM to an open devnet problem the sample solves')
    test.setTimeout(300_000)
    const secret = readFileSync(DEVNET_KEY, 'utf8')
    const solver = new PublicKey(Uint8Array.from(JSON.parse(secret)).slice(32))
    await page.addInitScript((key) => {
        localStorage.setItem('meteortoll:devWallet', key)
        localStorage.setItem('walletName', JSON.stringify('Dev Wallet (local test key)'))
    }, secret)
    await page.goto(`/solve?problem=${PROBLEM}`)
    await page.locator('input[type=file]').first().setInputFiles('public/samples/strassen-2x2x2.json')
    await expect(page.getByText('✓ Holds', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Commit and stake/ }).click()
    await expect(page.getByText(/one prompt/)).toBeVisible({ timeout: 60_000 })

    const connection = new Connection(process.env.LIVE_RPC ?? 'https://api.devnet.solana.com', 'confirmed')
    const attempt = attemptAddress(new PublicKey(PROBLEM), solver)
    await expect
        .poll(async () => (await connection.getAccountInfo(attempt))?.data[8 + 32 + 32 + 32 + 8 + 32 + 8] ?? -1, { timeout: 240_000, intervals: [3_000] })
        .toBe(2)
})
