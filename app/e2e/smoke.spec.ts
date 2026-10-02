import { expect, type Page, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

function watch(page: Page) {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
        if (message.type() === 'error' && !/429|Too Many Requests|Failed to load resource/i.test(message.text())) errors.push(`console: ${message.text()}`)
    })
    return errors
}

async function fitsTheScreen(page: Page) {
    const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }))
    expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(width + 1)
}

const TOTALS_MS = 150_000

test('home page', async ({ page }) => {
    test.setTimeout(TOTALS_MS + 30_000)
    const errors = watch(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('multiplications')
    await expect(page.getByLabel('Launchpad totals')).toContainText('Paid to solvers', { timeout: TOTALS_MS })
    await expect(page.locator('a[href^="/p/"]').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'terms and risks', exact: true })).toHaveAttribute('href', '/terms')
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('problem page', async ({ page }) => {
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

test('browser verifier', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/solve')
    await page.getByRole('button', { name: 'a correct one' }).click()
    await expect(page.getByText('✓ Holds', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'a broken one' }).click()
    await expect(page.getByText('✕ Does not hold', { exact: true })).toBeVisible()
    await expect(page.getByText('This scheme does not hold, so there is nothing to submit.', { exact: false })).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('menu pages open', async ({ page }) => {
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

test('unknown problem address', async ({ page }) => {
    await page.goto('/p/11111111111111111111111111111111')
    await expect(page.getByText('No problem at this address')).toBeVisible()
})

test('stats endpoint', async ({ request }) => {
    test.setTimeout(TOTALS_MS + 30_000)
    const response = await request.get('/api/stats', { timeout: TOTALS_MS })
    expect(response.ok()).toBe(true)
    const stats = await response.json()
    expect(typeof stats.problems).toBe('number')
    expect(BigInt(stats.paidLamports)).toBeGreaterThanOrEqual(0n)
})

test('launch flow', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/launch')
    await expect(page.getByText('Step 1 of 4')).toBeVisible()
    await expect(page.getByText('Step 4 of 4 · optional')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose a problem first' })).toBeDisabled()
    await page.getByRole('radiogroup', { name: 'Formats' }).getByText('2×12×15', { exact: true }).click()
    await expect(page.getByRole('radiogroup', { name: 'Formats' })).toBeHidden()
    await page.getByRole('button', { name: 'Change' }).click()
    await expect(page.getByRole('radiogroup', { name: 'Formats' })).toBeVisible()
    await page.getByRole('radiogroup', { name: 'Formats' }).getByText('2×12×15', { exact: true }).click()
    await expect(page.getByLabel('Target rank')).toHaveValue('277')
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.locator('#symbol').fill('')
    await expect(page.getByText('The symbol cannot be empty.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()
    await page.locator('#symbol').fill('MM21215')
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Your name and symbol.')).toBeVisible()
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

test('how it works tabs', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/trust')
    await expect(page.getByRole('list', { name: 'The loop' }).getByRole('listitem')).toHaveCount(4)
    await expect(page.getByRole('tab', { name: 'Where the money goes' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('figure', { name: "Where one trade's fee goes" })).toBeVisible()

    await page.getByRole('tab', { name: 'Why you can trust it' }).click()
    await expect(page).toHaveURL(/#trust$/)
    await expect(page.getByText('Code decides, not people')).toBeVisible()
    await expect(page.getByRole('figure', { name: "Where one trade's fee goes" })).toBeHidden()

    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Why it matters' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('tab', { name: 'Questions' }).click()
    await page.getByText('What if nobody solves it?').click()
    await expect(page.getByText('There is no deadline.')).toBeVisible()

    await page.goto('/trust#roles')
    for (const [title, cta] of [
        ['I want to trade', 'Browse problems'],
        ['I want to solve & earn', 'Open the solver'],
        ['I want to launch a problem', 'Launch a problem'],
    ]) {
        const column = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })
        await expect(column.getByRole('link', { name: cta })).toBeVisible()
    }
    await page.goto('/trust#why')
    await expect(page.getByRole('heading', { name: 'Why one multiplication matters' })).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('home roles', async ({ page }) => {
    await page.goto('/')
    for (const title of ['I want to trade', 'I want to solve & earn', 'I want to launch a problem']) {
        await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
    await fitsTheScreen(page)
})

test('solve page', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/solve')
    await expect(page.getByRole('heading', { name: 'Open bounties' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Download Strassen/ })).toHaveAttribute('href', '/samples/strassen-2x2x2.json')
    await expect(page.getByText('w is C transposed.')).toBeVisible()
    await page.getByText('Example, index layout and limits').click()
    await expect(page.getByText('entry (k, i) at k·n₁ + i')).toBeVisible()
    await page.locator('input[type=file]').first().setInputFiles('public/samples/strassen-2x2x2.json')
    await expect(page.getByText('✓ Holds', { exact: true })).toBeVisible()
    await expect(page.getByText('⟨2×2×2 : 7⟩')).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

const DEVNET_KEY = '../.keys/devnet.json'

test('portfolio', async ({ page }) => {
    test.skip(!existsSync(DEVNET_KEY), 'no local devnet key')
    test.setTimeout(120_000)
    const errors = watch(page)
    const secret = readFileSync(DEVNET_KEY, 'utf8')
    await page.addInitScript((key) => {
        localStorage.setItem('meteortoll:devWallet', key)
        localStorage.setItem('walletName', JSON.stringify('Dev Wallet (local test key)'))
    }, secret)
    await page.goto('/me')
    await expect(page.getByText('Added to bounties')).toBeVisible({ timeout: 60_000 })
    const lcheck = page.getByRole('row').filter({ hasText: 'LCHECK' })
    await expect(lcheck).toContainText('0.05 SOL', { timeout: 90_000 })
    await expect(lcheck).toContainText('%')
    await expect(page.getByText('Launched').first()).toBeVisible()
    await expect(lcheck.getByRole('link', { name: 'Sell' })).toHaveAttribute('href', /#sell$/)
    expect(errors).toEqual([])
})

test('theme', async ({ page }) => {
    const errors = watch(page)
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/trust')
    expect(await theme()).toBe('light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(theme).toBe('dark')

    const pick = async (label: string) => {
        await page.getByRole('banner').getByRole('button', { name: /^Theme/ }).click()
        await page.getByRole('menuitemradio', { name: label }).click()
        await expect(page.getByRole('menu')).toBeHidden()
    }
    await pick('Light')
    expect(await theme()).toBe('light')
    await page.reload()
    expect(await theme()).toBe('light')
    await expect(page.getByRole('banner').getByRole('button', { name: 'Theme: Light' })).toBeVisible()

    await pick('Dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.reload()
    expect(await theme()).toBe('dark')

    await page.getByRole('banner').getByRole('button', { name: /^Theme/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})

test('problem filters', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/')
    const grid = page.locator('#problems')
    await expect(grid.locator('a[href^="/p/"]').first()).toBeVisible({ timeout: 30_000 })
    for (const name of ['Open', 'Verifying', 'Solved', 'All']) {
        const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) })
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        const counted = Number((await tab.textContent())!.replace(/\D/g, ''))
        await expect(grid.locator('a[href^="/p/"]')).toHaveCount(counted)
    }
    await expect(grid.getByRole('button', { name: /^Buy 0.1 SOL of/ }).first()).toBeVisible()
    await fitsTheScreen(page)
    expect(errors).toEqual([])
})
