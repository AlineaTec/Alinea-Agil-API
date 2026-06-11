import assert from "node:assert/strict"
import { test } from "node:test"

import {
  computeCommercialQuote,
  effectivePaidTierSeats,
  seatsForNewWorkspaceFromIntent,
} from "./compute-commercial-quote.js"

test("plan Gratis: 5 usuarios, $0", () => {
  const q = computeCommercialQuote({
    plan: "individual",
    billingCadence: "monthly",
    planTier: "gratis",
  })
  assert.equal(q.seatsBilled, 5)
  assert.equal(q.monthlyListUsd, 0)
  assert.equal(q.planTier, "gratis")
})

test("plan Estándar: $6 por licencia, mínimo 1", () => {
  const q = computeCommercialQuote({
    plan: "team",
    billingCadence: "monthly",
    planTier: "estandar",
    teamSeatsRequested: 1,
  })
  assert.equal(q.seatsBilled, 1)
  assert.equal(q.monthlyListUsd, 6)
})

test("plan Profesional: $12 por licencia", () => {
  const q = computeCommercialQuote({
    plan: "team",
    billingCadence: "monthly",
    planTier: "profesional",
    teamSeatsRequested: 4,
  })
  assert.equal(q.seatsBilled, 4)
  assert.equal(q.monthlyListUsd, 48)
})

test("effectivePaidTierSeats aplica mínimo 1", () => {
  assert.equal(effectivePaidTierSeats(undefined), 1)
  assert.equal(effectivePaidTierSeats(0), 1)
  assert.equal(effectivePaidTierSeats(7), 7)
})

test("seatsForNewWorkspaceFromIntent gratis → 5", () => {
  assert.equal(
    seatsForNewWorkspaceFromIntent({ modality: "individual", planTier: "gratis" }),
    5,
  )
})
