import { readFileSync } from 'node:fs'
import { encodeScheme, type FmmScheme } from '@meteortoll/core'

export function readScheme(path: string): Buffer {
    if (path.toLowerCase().endsWith('.json')) return Buffer.from(encodeScheme(JSON.parse(readFileSync(path, 'utf8')) as FmmScheme))
    return readFileSync(path)
}
