// The docs, checked against the code they describe. Code moves faster than prose; when it moves,
// these fail until the docs say the same thing again. What is checked is what drifts: paths, the
// variables the app reads, the limits it enforces, the commands it offers, the calls it makes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { MAX_FILE_BYTES, MAX_SCHEME_BYTES } from './checkFile'
import { MAX_BATCH, MAX_BODY_BYTES } from './proxyLimits'
import { LIMITS } from './report'
import { SLIPPAGE_BPS } from './trade'

const ROOT = new URL('../../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8')
const exists = (path: string) => existsSync(new URL(path, ROOT))

const DOCS = ['README.md', 'SCOPE.md', 'app/README.md', 'docs/meteora.md', 'docs/security.md', 'docs/devnet-run.md']

/// Every file under a directory, skipping tests.
function sources(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(new URL(dir, ROOT))) {
        const path = `${dir}/${entry}`
        if (statSync(new URL(path, ROOT)).isDirectory()) out.push(...sources(path))
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(path)
    }
    return out
}

/// `inline code` spans that name a file or directory of this repository: anything with a directory
/// in it, or a top-level document. A bare file name (`access_control.rs`) may be someone else's.
function repoPaths(markdown: string): string[] {
    return [...markdown.matchAll(/`([^`\s]+)`/g)]
        .map((m) => m[1])
        .filter((token) => /^(\.?[\w-]+\/)+[\w.\-[\]]*$|^[A-Z][\w-]*\.md$/.test(token))
        .filter((token) => !token.includes('*') && !token.startsWith('http'))
}

test('every path the docs name exists', () => {
    const missing: string[] = []
    for (const doc of DOCS) {
        const base = doc.startsWith('app/') ? 'app/' : ''
        for (const path of repoPaths(read(doc))) {
            // A path in the app's README is relative to the app.
            if (!exists(path) && !exists(base + path)) missing.push(`${doc}: ${path}`)
        }
    }
    assert.deepEqual(missing, [])
})

test('no doc carries a path from someone’s machine', () => {
    for (const doc of DOCS) assert.doesNotMatch(read(doc), /\b[A-Z]:\\|\/Users\/|\/home\/\w+\//, doc)
})

/// Variables the hosting platform sets on its own; they are not configuration.
const HOST_SET = new Set(['VERCEL', 'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA', 'NODE_ENV'])

test('the app README documents exactly the variables the app reads, where it reads them', () => {
    const read_: Map<string, Set<string>> = new Map()
    for (const file of sources('app/src')) {
        for (const m of read(file).matchAll(/\benv\.([A-Z][A-Z0-9_]*[A-Z0-9])\b/g)) {
            if (HOST_SET.has(m[1])) continue
            if (!read_.has(m[1])) read_.set(m[1], new Set())
            read_.get(m[1])!.add(file.replace(/^app\//, ''))
        }
    }
    const rows = read('app/README.md')
        .split('\n')
        .filter((line) => line.startsWith('| `'))
        .map((line) => line.split('|').map((cell) => cell.trim()))
    const documented = new Map<string, string>()
    for (const [, names, where] of rows) for (const m of names.matchAll(/`([A-Z][A-Z0-9_]+)`/g)) documented.set(m[1], where)

    assert.deepEqual([...documented.keys()].sort(), [...read_.keys()].sort(), 'documented variables differ from those the code reads')
    for (const [name, where] of documented) {
        const files = [...where.matchAll(/`([^`]+)`/g)].map((m) => m[1])
        assert.ok(
            files.some((file) => read_.get(name)!.has(file)),
            `${name} is documented as read in ${files.join(', ')}, but the code reads it in ${[...read_.get(name)!].join(', ')}`
        )
    }
})

test('the limits in the security notes are the limits in the code', () => {
    const doc = read('docs/security.md')
    const KiB = 1024
    const MiB = 1024 * KiB
    for (const stated of [
        `bodies ≤ ${MAX_BODY_BYTES / KiB} KiB`,
        `batches ≤ ${MAX_BATCH}`,
        `Files over ${MAX_FILE_BYTES / MiB} MiB`,
        `program's ${MAX_SCHEME_BYTES / MiB} MiB limit`,
        `${SLIPPAGE_BPS / 100}% slippage limit`,
        `≤ ${LIMITS.body / KiB} KiB`,
    ]) {
        assert.ok(doc.includes(stated), `docs/security.md should say "${stated}"`)
    }
})

test('every command the README offers exists', () => {
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

test('the calls docs/meteora.md names are the calls the code makes', () => {
    const table = read('docs/meteora.md')
    // Our TypeScript: the app, the CLI (which encodes the launch config) and the shared package.
    const app = [...sources('app/src'), ...sources('client/src'), ...sources('packages/core/src')].map(read).join('\n')
    const appOnly = sources('app/src').map(read).join('\n')
    const program = sources('programs/toll/src').map(read).join('\n') + readdirSync(new URL('programs/toll/src/instructions', ROOT)).join('\n')
    const meteora = read('idls/dynamic_bonding_curve.json') + read('idls/cp_amm.json')
    for (const row of table.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Path') && !l.startsWith('|---'))) {
        const [, path, ours, theirs] = row.split('|').map((c) => c.trim())
        // A row about the app is a claim about the app, not about the CLI.
        const typescript = /\bapp\b/i.test(path) ? appOnly : app
        for (const name of [...(ours + ' ' + theirs).matchAll(/`([A-Za-z_][\w]*)`/g)].map((m) => m[1])) {
            // A TypeScript name must be called, accessed or imported as a whole word: swapQuote is not
            // swapQuote2, and "swap" in a comment is not a call.
            const used = new RegExp(`\\b${name}\\s*\\(|\\.${name}\\b|import[^;]*\\b${name}\\b`)
            const found = /^[a-z]+(_[a-z0-9]+)+$/.test(name) ? program.includes(name) || meteora.includes(`"${name}"`) : used.test(typescript)
            assert.ok(found, `docs/meteora.md names \`${name}\`, which the code does not use`)
        }
    }
})
