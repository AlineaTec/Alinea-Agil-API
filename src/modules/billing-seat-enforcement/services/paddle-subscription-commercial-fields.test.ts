import assert from "node:assert/strict"
import { test } from "node:test"

import { extractPaddleCommercialCycleFields } from "./paddle-subscription-commercial-fields.js"

test("extractPaddleCommercialCycleFields parsea current_billing_period", () => {
  const d = extractPaddleCommercialCycleFields({
    current_billing_period: {
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2026-02-01T00:00:00.000Z",
    },
    next_billed_at: "2026-02-01T00:00:00.000Z",
  })
  assert.equal(d.currentPeriodStartsAt?.toISOString(), "2026-01-01T00:00:00.000Z")
  assert.equal(d.currentPeriodEndsAt?.toISOString(), "2026-02-01T00:00:00.000Z")
  assert.ok(d.billingCycleAnchor)
})
