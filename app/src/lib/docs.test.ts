import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const ROOT = new URL('../../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8')
const exists = (path: string) => existsSync(new URL(path, ROOT))

const DOCS = ['README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md']

function repoPaths(markdown: string): string[] {
    return [...markdown.matchAll(/`([^`\s]+)`/g), ...markdown.matchAll(/\]\(([^)\s#]+)\)/g)]
        .map((m) => m[1])
        .filter((token) => /^(\.?[\w-]+\/)+[\w.\-[\]]*$|^[A-Z][\w-]*\.md$|^LICENSE-\w+$/.test(token))
        .filter((token) => !token.includes('*') && !token.startsWith('http') && !token.includes('<'))
}

test('paths exist', () => {
    const missing: string[] = []
    for (const doc of DOCS) for (const path of repoPaths(read(doc))) if (!exists(path)) missing.push(`${doc}: ${path}`)
    assert.deepEqual(missing, [])
})

test('no local paths', () => {
    for (const doc of DOCS) assert.doesNotMatch(read(doc), /\b[A-Z]:\|\/Users\/|\/home\/\w+\//, doc)
})

test('readme commands', () => {
    const block = read('README.md').split('```bash')[1].split('```')[0]
    for (const line of block.split('\n').map((l) => l.split('#')[0].trim()).filter(Boolean)) {
        for (const part of line.split('&&').map((p) => p.trim())) {
            const script = part.match(/^(scripts\/[\w.-]+)/)
            if (script) assert.ok(exists(script[1]), `${script[1]} does not exist`)
            const npm = part.match(/^npm (?:run )?([\w:-]+)(?: .*)? -w (\w+)/)
            if (npm && npm[1] !== 'install') {
                const scripts = JSON.parse(read(`${npm[2]}/package.json`)).scripts ?? {}
                assert.ok(npm[1] in scripts, `${npm[2]}/package.json has no "${npm[1]}" script`)
            }
        }
    }
})
