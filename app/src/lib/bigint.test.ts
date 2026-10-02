import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE } from 'bigint-buffer'
import { u64, u128 } from '@solana/buffer-layout-utils'

test('round trip', () => {
    for (const n of [0n, 1n, 255n, 256n, 123456789012345n, 2n ** 64n - 1n]) {
        assert.equal(toBigIntLE(toBufferLE(n, 8)), n)
        assert.equal(toBigIntBE(toBufferBE(n, 8)), n)
    }
})

test('byte order', () => {
    assert.deepEqual([...toBufferLE(0x0102n, 4)], [2, 1, 0, 0])
    assert.deepEqual([...toBufferBE(0x0102n, 4)], [0, 0, 1, 2])
    assert.equal(toBigIntLE(Buffer.from([2, 1])), 0x0102n)
    assert.equal(toBigIntBE(Buffer.from([1, 2])), 0x0102n)
})

test('empty and zero width', () => {
    assert.equal(toBigIntLE(Buffer.alloc(0)), 0n)
    assert.equal(toBigIntBE(Buffer.alloc(0)), 0n)
    assert.equal(toBufferLE(5n, 0).length, 0)
})

test('overflow wraps', () => {
    assert.deepEqual([...toBufferBE(0x010203n, 2)], [2, 3])
    assert.deepEqual([...toBufferLE(0x010203n, 2)], [3, 2])
})

test('bad input', () => {
    assert.throws(() => toBufferLE(-1n, 8), RangeError)
    assert.throws(() => toBufferBE(1n, -1), RangeError)
    assert.throws(() => toBufferBE(1n, 1.5), RangeError)
    assert.throws(() => toBufferBE(1 as unknown as bigint, 8), RangeError)
})

test('spl layouts', () => {
    const buf = Buffer.alloc(16)
    u64('a').encode(123456789012345n, buf, 0)
    assert.equal(u64('a').decode(buf, 0), 123456789012345n)
    u128('a').encode(2n ** 127n + 5n, buf, 0)
    assert.equal(u128('a').decode(buf, 0), 2n ** 127n + 5n)
})
