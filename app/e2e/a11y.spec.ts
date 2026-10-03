import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

const SCHEMES = ['light', 'dark'] as const

async function scan(page: Page, name: string) {
    await page.waitForTimeout(500)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    const report = serious.map((v) => `${name}: ${v.id} (${v.impact}) ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}  ${n.failureSummary?.split('\n').slice(1).join(' ')}`).join('\n')}`)
    expect(report, report.join('\n')).toEqual([])
}

async function open(page: Page, path: string) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

for (const scheme of SCHEMES) {
    test.describe(scheme, () => {
        test.use({ colorScheme: scheme })

        for (const path of ['/', '/launch', '/solve', '/me', '/terms']) {
            test(`page ${path}`, async ({ page }) => {
                await open(page, path)
                if (path === '/') await page.locator('a[href^="/p/"]').first().waitFor({ timeout: 30_000 })
                await scan(page, `${scheme} ${path}`)
            })
        }

        test('trust tabs', async ({ page }) => {
            await open(page, '/trust')
            const tabs = page.getByRole('tab')
            const names = await tabs.allTextContents()
            expect(names.length).toBeGreaterThan(1)
            for (const name of names) {
                await page.getByRole('tab', { name, exact: true }).click()
                await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
                await scan(page, `${scheme} /trust ${name}`)
            }
        })

        test('problem page', async ({ page }) => {
            await page.goto('/')
            const first = page.locator('a[href^="/p/"]').first()
            await first.waitFor({ timeout: 30_000 })
            await open(page, (await first.getAttribute('href'))!)
            await expect(page.getByRole('heading', { name: 'Trade', exact: true })).toBeVisible()
            await page.getByRole('link', { name: 'transaction' }).first().waitFor({ timeout: 30_000 })
            await scan(page, `${scheme} problem`)
        })
    })
}
