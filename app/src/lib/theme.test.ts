import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_THEME, parseChoice, resolveTheme, THEME_BOOT, THEME_KEY } from './theme'

test('stored choice', () => {
    assert.equal(parseChoice('dark'), 'dark')
    assert.equal(parseChoice('light'), 'light')
    assert.equal(parseChoice('system'), 'system')
    for (const junk of [null, '', 'blue', 'DARK']) assert.equal(parseChoice(junk), DEFAULT_THEME)
})

test('resolve', () => {
    assert.equal(resolveTheme('system', true), 'light')
    assert.equal(resolveTheme('system', false), 'dark')
    assert.equal(resolveTheme('dark', true), 'dark')
    assert.equal(resolveTheme('light', false), 'light')
})

function boot(stored: string | null, prefersLight: boolean, storageThrows = false): string | undefined {
    const dataset: Record<string, string> = {}
    const window = { matchMedia: () => ({ matches: prefersLight }) }
    const localStorage = {
        getItem: (key: string) => {
            if (storageThrows) throw new Error('blocked')
            return key === THEME_KEY ? stored : null
        },
    }
    const document = { documentElement: { dataset } }
    new Function('window', 'localStorage', 'document', THEME_BOOT)(window, localStorage, document)
    return dataset.theme
}

test('boot script', () => {
    for (const stored of ['dark', 'light', 'system', null, 'junk']) {
        for (const prefersLight of [true, false]) {
            assert.equal(boot(stored, prefersLight), resolveTheme(parseChoice(stored), prefersLight), `${stored} ${prefersLight}`)
        }
    }
})

test('blocked storage', () => {
    assert.equal(boot('light', false, true), 'dark')
    assert.equal(boot(null, true, true), 'light')
})
