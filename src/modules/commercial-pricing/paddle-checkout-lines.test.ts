import assert from "node:assert/strict"
import { test } from "node:test"

import {
  additionalSeatQuantityFromDesiredTeamSeats,
  buildPaddleSubscriptionCheckoutLines,
} from "./paddle-checkout-lines.js"
import { createPaddlePriceCatalogForTests } from "./paddle-price-catalog.js"

const CAT = createPaddlePriceCatalogForTests({
  individualMonthly: "pri_ind_m",
  individualAnnual: "pri_ind_y",
  teamBaseMonthly: "pri_tb_m",
  teamBaseAnnual: "pri_tb_y",
  additionalSeatMonthly: "pri_ad_m",
  additionalSeatAnnual: "pri_ad_y",
})

test("additionalSeatQty = max(0, desired - 3)", () => {
  assert.equal(additionalSeatQuantityFromDesiredTeamSeats(3), 0)
  assert.equal(additionalSeatQuantityFromDesiredTeamSeats(5), 2)
})

test("checkout Team desiredSeats = 3 solo base", () => {
  const r = buildPaddleSubscriptionCheckoutLines({
    plan: "team",
    billingCadence: "monthly",
    teamSeatsRequested: 3,
    catalog: CAT,
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.lines.length, 1)
    assert.equal(r.lines[0]!.priceId, "pri_tb_m")
    assert.equal(r.lines[0]!.quantity, 1)
  }
})

test("checkout Team desiredSeats > 3 incluye addon", () => {
  const r = buildPaddleSubscriptionCheckoutLines({
    plan: "team",
    billingCadence: "monthly",
    teamSeatsRequested: 6,
    catalog: CAT,
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.lines.length, 2)
    assert.equal(r.lines[0]!.priceId, "pri_tb_m")
    assert.equal(r.lines[0]!.quantity, 1)
    assert.equal(r.lines[1]!.priceId, "pri_ad_m")
    assert.equal(r.lines[1]!.quantity, 3)
  }
})

test("checkout Individual un solo item", () => {
  const r = buildPaddleSubscriptionCheckoutLines({
    plan: "individual",
    billingCadence: "monthly",
    catalog: CAT,
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.lines, [{ priceId: "pri_ind_m", quantity: 1 }])
  }
})
