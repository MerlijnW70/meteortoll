import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POST as report } from '../app/api/report/route'
import { GET as metadata } from '../app/api/metadata/[mint]/route'

const SITE = 'https://meteortoll.vercel.app'
const post = (path: string, headers: Record<string, string>, body = '{}') => new Request(SITE + path, { method: 'POST', headers, body })

test('report null origin', async () => {
    assert.equal((await report(post('/api/report', { origin: 'null' }))).status, 403)
    assert.equal((await report(post('/api/report', { origin: 'https://evil.example' }))).status, 403)
})

test('report budget', async () => {
    const send = () => report(post('/api/report', { origin: SITE, 'x-forwarded-for': '203.0.113.9' }, '{}'))
    for (let i = 0; i < 20; i++) assert.notEqual((await send()).status, 429)
    assert.equal((await send()).status, 429)
})

test('metadata budget', async () => {
    const lookup = () =>
        metadata(new Request(SITE + '/api/metadata/x', { headers: { 'x-forwarded-for': '203.0.113.7' } }), { params: Promise.resolve({ mint: 'not-a-mint' }) } as never)
    for (let i = 0; i < 600; i++) assert.equal((await lookup()).status, 400)
    assert.equal((await lookup()).status, 429)
})
