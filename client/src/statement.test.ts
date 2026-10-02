import { test } from 'node:test'
import assert from 'node:assert/strict'
import { targetProblem } from '../../app/src/lib/known.js'

test('launch refusals', () => {
    assert.equal(targetProblem([2, 12, 15], 277), null)
    assert.match(targetProblem([3, 3, 3], 8) ?? '', /fewer than 9/)
    assert.match(targetProblem([2, 2, 2], 7) ?? '', /already answered/)
    assert.match(targetProblem([2, 12, 15], 278) ?? '', /already published/)
})
