import { expect, type Page, test } from '@playwright/test'

// What a visitor without a wallet sees, on every page, on desktop and phone: content loads from
// the chain, the in-browser verifier gives the right verdicts, nothing throws, and nothing is
// wider than the screen.

/// Fails the test on any uncaught page error; console errors are collected for the assertion.
function watch(page: Page) {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
        // A public RPC may rate-limit a burst; the app retries those, so they are not failures.
        if (message.type() === 'error' && !/429|Too Many Requests|Failed to load resource/i.test(message.text())) errors.push(`console: ${message.text()}`)
    })
    return errors
}

async function fitsTheScreen(page: Page) {
    const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }))
    expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(width + 1)
}

/// The totals read every pool's history: on a public RPC that can take a minute or two.
const TOTALS_MS = 150_000

test('home lists problems and the launchpad totals', async ({ page }) => {
    test.setTimeout(TOTALS_MS + 30_000)
    const errors = watch(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('multiplications')
    await expect(page.getByLabel('Launchpad totals')).toContainText('Paid to solvers', { timeout: TOTALS_MS })
    await expect(page.locator('a[href^="/p/"]').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'terms and risks' })).toHaveAttribute('href', '/terms')
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('a problem page shows its record, market and history', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/')
    const first = page.locator('a[href^="/p/"]').first()
    await first.waitFor()
    await page.goto((await first.getAttribute('href'))!)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('⟨')
    await expect(page.getByText('Record to beat').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
    await expect(page.getByText('Launched').first()).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('the in-browser verifier accepts the sample and rejects it with one sign flipped', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/solve')
    await page.getByRole('button', { name: /rank-314 scheme/ }).click()
    await expect(page.getByText('Holds', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /one sign flipped/ }).click()
    await expect(page.getByText('Does not hold', { exact: true })).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('every page in the menu opens', async ({ page }) => {
    const errors = watch(page)
    for (const [path, heading] of [
        ['/launch', 'Launch a problem'],
        ['/me', 'Your portfolio'],
        ['/trust', 'How it works'],
        ['/terms', 'Terms and risks'],
    ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
        await fitsTheScreen(page)
    }
    expect(errors).toEqual([])
})

test('an address that is not a problem gets a page saying so', async ({ page }) => {
    await page.goto('/p/11111111111111111111111111111111')
    await expect(page.getByText('No problem at this address')).toBeVisible()
})

test('the totals endpoint answers with numbers', async ({ request }) => {
    test.setTimeout(TOTALS_MS + 30_000)
    const response = await request.get('/api/stats', { timeout: TOTALS_MS })
    expect(response.ok()).toBe(true)
    const stats = await response.json()
    expect(typeof stats.problems).toBe('number')
    expect(BigInt(stats.paidLamports)).toBeGreaterThanOrEqual(0n)
})

test('launching walks from a format to a priced first buy and a live preview', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/launch')
    await page.getByRole('radiogroup', { name: 'Formats' }).getByText('2×12×15', { exact: true }).click()
    await expect(page.getByLabel('Target rank')).toHaveValue('277')
    await expect(page.getByText('One below the record')).toBeVisible()
    await page.getByLabel('Raise the target').click()
    await expect(page.getByText('already published')).toBeVisible()
    await page.getByLabel('Lower the target').click()
    await expect(page.getByText('MM21215')).toHaveCount(2)
    await page.getByRole('radio', { name: '0.1 SOL' }).click()
    await expect(page.getByText('You receive')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByLabel('Preview')).toContainText('⟨2×12×15 : ≤277⟩')
    await page.getByRole('radio', { name: 'Other' }).click()
    await page.getByLabel('First buy in SOL').fill('abc')
    await expect(page.getByText('Type an amount in SOL')).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})
