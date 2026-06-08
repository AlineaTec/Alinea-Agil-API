import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createPaddlePriceCatalogForTests,
  deriveCommercialSeatEntitlementFromPaddleItems,
} from "./paddle-price-catalog.js"

const CAT = createPaddlePriceCatalogForTests({
  individualMonthly: "pri_ind_m",
  individualAnnual: "pri_ind_y",
  teamBaseMonthly: "pri_tb_m",
  teamBaseAnnual: "pri_tb_y",
  additionalSeatMonthly: "pri_ad_m",
  additionalSeatAnnual: "pri_ad_y",
})

test("Individual monthly mapea a 1 asiento", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems(
    [{ price_id: "pri_ind_m", quantity: 1 }],
    CAT,
  )
  assert.equal(d.entitledSeats, 1)
  assert.equal(d.planKind, "individual")
  assert.equal(d.usedLegacyQuantitySum, false)
})

test("Team solo base (3 asientos) monthly", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems(
    [{ price_id: "pri_tb_m", quantity: 1 }],
    CAT,
  )
  assert.equal(d.entitledSeats, 3)
  assert.equal(d.planKind, "team")
})

test("Team base + addon: 3 + N", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems(
    [
      { price_id: "pri_tb_m", quantity: 1 },
      { price_id: "pri_ad_m", quantity: 2 },
    ],
    CAT,
  )
  assert.equal(d.entitledSeats, 5)
})

test("Team base qty 2 no aumenta entitlement más allá de 3 + addon", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems(
    [
      { price_id: "pri_tb_m", quantity: 2 },
      { price_id: "pri_ad_m", quantity: 1 },
    ],
    CAT,
  )
  assert.equal(d.entitledSeats, 4)
  assert.ok(d.issues.includes("team_base_quantity_not_one"))
})

test("No mezclar monthly y annual", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems(
    [
      { price_id: "pri_tb_m", quantity: 1 },
      { price_id: "pri_ad_y", quantity: 1 },
    ],
    CAT,
  )
  assert.equal(d.entitledSeats, null)
  assert.ok(d.issues.includes("mixed_billing_interval_monthly_and_annual"))
})

test("Individual no admite addon en v1 — conflicto con Additional Seat", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems(
    [
      { price_id: "pri_ind_m", quantity: 1 },
      { price_id: "pri_ad_m", quantity: 2 },
    ],
    CAT,
  )
  assert.equal(d.entitledSeats, null)
  assert.equal(d.planKind, null)
  assert.ok(d.issues.includes("conflicting_individual_and_team_lines"))
})

test("Legacy sin catálogo: suma quantities", () => {
  const d = deriveCommercialSeatEntitlementFromPaddleItems([{ quantity: 7 }], null)
  assert.equal(d.entitledSeats, 7)
  assert.equal(d.usedLegacyQuantitySum, true)
})
