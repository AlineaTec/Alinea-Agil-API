import assert from "node:assert/strict"
import { test } from "node:test"

import {
  additionalSeatQuantityFromDesiredTeamSeats,
  buildPaddleSubscriptionCheckoutLines,
} from "./paddle-checkout-lines.js"
import { createPaddlePriceCatalogForTests } from "./paddle-price-catalog.js"

const CAT = createPaddlePriceCatalogForTests({
  individualMonthly: "pri_ind_m",
  teamBaseMonthly: "pri_tb_m",
  additionalSeatMonthly: "pri_ad_m",
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

const TIER_CAT = createPaddlePriceCatalogForTests({
  tierPerSeatModel: true,
  estandarLicenseMonthly: "pri_est_m",
  profesionalLicenseMonthly: "pri_pro_m",
})

test("checkout Estándar: una línea por licencia", () => {
  const r = buildPaddleSubscriptionCheckoutLines({
    plan: "team",
    billingCadence: "monthly",
    teamSeatsRequested: 4,
    planTier: "estandar",
    catalog: TIER_CAT,
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.lines, [{ priceId: "pri_est_m", quantity: 4 }])
  }
})

test("checkout Profesional: una línea por licencia", () => {
  const r = buildPaddleSubscriptionCheckoutLines({
    plan: "team",
    billingCadence: "monthly",
    teamSeatsRequested: 2,
    planTier: "profesional",
    catalog: TIER_CAT,
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.lines, [{ priceId: "pri_pro_m", quantity: 2 }])
  }
})
