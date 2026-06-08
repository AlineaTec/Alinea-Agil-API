import assert from "node:assert/strict"
import { test } from "node:test"

import { addCalendarDaysUtc, CALENDAR_GRACE_DAYS_V1, computeGraceEndsAtInclusivePattern } from "./billing-period.policy.js"

test("computeGraceEndsAtInclusivePattern adds 15 calendar days (v1 grace)", () => {
  const start = new Date("2026-01-10T12:00:00.000Z")
  const ends = computeGraceEndsAtInclusivePattern(start)
  const expected = addCalendarDaysUtc(start, CALENDAR_GRACE_DAYS_V1)
  assert.equal(ends.getTime(), expected.getTime())
})
