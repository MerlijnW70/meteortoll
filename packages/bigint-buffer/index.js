'use strict'

const { Buffer } = require('buffer')

function hexToBigInt(hex) {
    return hex.length === 0 ? 0n : BigInt('0x' + hex)
}

function toHex(num, width) {
    if (typeof num !== 'bigint' || num < 0n) throw new RangeError('expected a non-negative bigint')
    if (!Number.isInteger(width) || width < 0) throw new RangeError('expected a non-negative integer width')
    return num.toString(16).padStart(width * 2, '0').slice(-width * 2)
}

exports.toBigIntBE = (buf) => hexToBigInt(Buffer.from(buf).toString('hex'))
exports.toBigIntLE = (buf) => hexToBigInt(Buffer.from(buf).reverse().toString('hex'))
exports.toBufferBE = (num, width) => (width === 0 ? Buffer.alloc(0) : Buffer.from(toHex(num, width), 'hex'))
exports.toBufferLE = (num, width) => exports.toBufferBE(num, width).reverse()
