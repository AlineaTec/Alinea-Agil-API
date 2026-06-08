import assert from "node:assert/strict"
import { test } from "node:test"

import {
  extractScheduledFutureSeatIncrease,
  extractWorkspacePublicIdFromCustomData,
  sumItemQuantities,
} from "./paddle-webhook-mapper.js"

test("sumItemQuantities suma líneas", () => {
  assert.equal(sumItemQuantities({ items: [{ quantity: 3 }, { quantity: 2 }] }), 5)
  assert.equal(sumItemQuantities({}), null)
})

test("extractWorkspacePublicIdFromCustomData", () => {
  assert.equal(
    extractWorkspacePublicIdFromCustomData({
      custom_data: { workspace_public_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee" },
    }),
    "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
  )
})

test("scheduled_change futuro no aplica si qty no supera comprado (legacy sum)", () => {
  const now = new Date("2026-06-01T00:00:00.000Z")
  const effectiveAt = new Date("2026-07-01T00:00:00.000Z")
  const out = extractScheduledFutureSeatIncrease(
    {
      scheduled_change: {
        effective_at: effectiveAt.toISOString(),
        items: [{ quantity: 5 }],
      },
    },
    now,
    5,
    null,
  )
  assert.equal(out, null)
})

test("scheduled_change futuro con incremento vs licencia actual (legacy)", () => {
  const now = new Date("2026-06-01T00:00:00.000Z")
  const effectiveAt = new Date("2026-07-01T00:00:00.000Z")
  const out = extractScheduledFutureSeatIncrease(
    {
      scheduled_change: {
        effective_at: effectiveAt.toISOString(),
        items: [{ quantity: 8 }],
      },
    },
    now,
    3,
    null,
  )
  assert.ok(out)
  assert.equal(out!.seats, 8)
})
