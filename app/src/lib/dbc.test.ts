import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DynamicBondingCurveIdl, PROTOCOL_FEE_PERCENT as SDK_FEE } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { dbcIdl, PROTOCOL_FEE_PERCENT } from './dbc'

test('idl matches sdk', () => {
    assert.deepEqual(dbcIdl, DynamicBondingCurveIdl)
})

test('protocol fee matches sdk', () => {
    assert.equal(PROTOCOL_FEE_PERCENT, SDK_FEE)
})
