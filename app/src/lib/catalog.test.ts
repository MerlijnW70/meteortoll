import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PublicKey } from '@solana/web3.js'
import catalog from '../../../problems/catalog.json'

const address = (value: string) => {
    try {
        return new PublicKey(value).toBase58() === value
    } catch {
        return false
    }
}

test('every catalog entry names a real problem and mint, and coherent ranks', () => {
    for (const [cluster, entries] of Object.entries(catalog as Record<string, Record<string, Record<string, unknown>>>)) {
        for (const [problem, entry] of Object.entries(entries)) {
            const where = `${cluster} ${problem}`
            assert.ok(address(problem), `${where}: problem address`)
            assert.ok(address(entry.mint as string), `${where}: mint`)
            assert.ok(entry.kind === 'demo' || entry.kind === 'open', `${where}: kind`)
            const best = (entry.bestKnown as { rank: number }).rank
            assert.ok(best > 0 && best < (entry.naive as number), `${where}: best known below schoolbook`)
            const ours = entry.ourRecord as { rank: number } | undefined
            if (ours) assert.ok(ours.rank > 0 && ours.rank <= (entry.naive as number), `${where}: team record`)
            if (entry.kind === 'demo') assert.ok(typeof entry.demoNote === 'string' && entry.demoNote.length > 0, `${where}: a demo says why`)
        }
    }
})
