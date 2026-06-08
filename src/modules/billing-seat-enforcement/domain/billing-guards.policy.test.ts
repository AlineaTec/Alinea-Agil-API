import assert from "node:assert/strict"
import { test } from "node:test"

import { deriveExpansionGuards, resolveOperationalView } from "./billing-guards.policy.js"
import type { WorkspaceBillingSnapshotProps } from "./workspace-billing-snapshot.js"

function baseRow(overrides: Partial<WorkspaceBillingSnapshotProps> = {}): WorkspaceBillingSnapshotProps {
  const now = new Date()
  return {
    workspacePublicId: "00000000-0000-4000-8000-000000000001",
    billingSource: "paddle",
    subscriptionExternalId: null,
    planKey: "team",
    includedSeats: 3,
    additionalPaidSeats: 0,
    currentEntitledSeats: 3,
    scheduledEntitledSeats: 100,
    scheduledSeatChangeEffectiveAt: addDays(now, 30),
    billingStatus: "active",
    gracePeriodStartsAt: null,
    gracePeriodEndsAt: null,
    suspensionEffectiveAt: null,
    peakUsageInBillingPeriod: 0,
    maxConcurrentActiveUsers: 0,
    billingCycleAnchor: null,
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
    lastCommercialSyncAt: now,
    commercialExternalSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

test("scheduled future seats do not widen expansion when current entitlement lower", () => {
  const row = baseRow()
  const activeUsers = 3
  const op = resolveOperationalView(row, new Date())
  const g = deriveExpansionGuards({
    snapshot: row,
    activeAssignedUsers: activeUsers,
    currentEntitledSeats: row.currentEntitledSeats,
    availableSeatsRaw: row.currentEntitledSeats - activeUsers,
    operationalView: op,
  })
  /** Al límite exacto ⇒ sin libres ⇒ bloque expansión **/

  assert.equal(g.canInviteSeatConsumingMembers, false)

  /** Programado 100 no cambia entitlement actual **/

  assert.equal(row.currentEntitledSeats, 3)

  assert.equal(g.overCapacity, false)
})

test("over capacity blocks expansion but not flagged as exhaustion when strictly over entitlement", () => {
  const row = baseRow({ currentEntitledSeats: 2 })
  const op = resolveOperationalView(row, new Date())
  const g = deriveExpansionGuards({
    snapshot: row,
    activeAssignedUsers: 5,
    currentEntitledSeats: 2,
    availableSeatsRaw: 2 - 5,
    operationalView: op,
  })

  assert.equal(g.overCapacity, true)

  assert.equal(g.canInviteSeatConsumingMembers, false)

  assert.equal(g.expansionBlockedReason, "over_capacity_regularization")

})

test("suspended_non_payment keeps billing routes positive but locks expansion", () => {

  const now = new Date()

  const row = baseRow({ billingStatus: "suspended_non_payment", suspensionEffectiveAt: now })

  const op = resolveOperationalView(row, now)
  assert.equal(op.suspendedOperational, true)

  const g = deriveExpansionGuards({
    snapshot: row,
    activeAssignedUsers: 1,
    currentEntitledSeats: 5,
    availableSeatsRaw: 4,
    operationalView: op,
  })
  assert.equal(g.canAccessBillingAndRegularizationRoutes, true)


  assert.equal(g.canInviteSeatConsumingMembers, false)

})
