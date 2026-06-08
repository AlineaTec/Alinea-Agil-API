import assert from "node:assert/strict"
import { test } from "node:test"

import { BillingSeatExpansionBlockedError } from "./billing-seat-expansion.errors.js"
import { assertCanExpandSeatConsumptionFromPublicState } from "./billing-seat-expansion.policy.js"
import type { WorkspaceBillingPublicState } from "./workspace-billing-public-state.js"

function stubState(
  overrides: Partial<WorkspaceBillingPublicState> &
    Pick<WorkspaceBillingPublicState, "billingStatus" | "guards">,
): WorkspaceBillingPublicState {
  return {
    workspacePublicId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
    billingSource: "paddle",
    commercialExternalSnapshot: null,
    planKey: "team",
    seats: {
      includedInPlan: 3,
      additionalPaid: 0,
      currentEntitled: 3,
      scheduledEntitledFuture: null,
      scheduledSeatChangeEffectiveAt: null,
    },
    usage: {
      activeAssignedUsers: 2,
      availableSeats: 1,
      overCapacity: false,
      internalPeakUsageInBillingPeriod: 0,
      internalMaxConcurrentActiveUsersRecorded: 0,
    },
    grace: {
      isInGraceWindow: false,
      gracePeriodStartsAt: null,
      gracePeriodEndsAt: null,
      messagingGraceDay: null,
    },
    timestamps: {
      lastCommercialSyncAt: null,
      billingCycleAnchor: null,
      currentPeriodStartsAt: null,
      currentPeriodEndsAt: null,
    },
    ...overrides,
  }
}

test("permite expansión cuando guards permiten invitar", () => {
  assertCanExpandSeatConsumptionFromPublicState(
    stubState({
      billingStatus: "active",
      guards: {
        canUsePrimaryWorkspaceProductFeatures: true,
        canAccessBillingAndRegularizationRoutes: true,
        canInviteSeatConsumingMembers: true,
        canActivateOrReactivateSeatConsumingMembers: true,
        expansionBlockedReason: null,
      },
    }),
  )
})

test("sobrecapacidad bloquea con código distinguible", () => {
  assert.throws(
    () =>
      assertCanExpandSeatConsumptionFromPublicState(
        stubState({
          billingStatus: "active",
          usage: {
            activeAssignedUsers: 5,
            availableSeats: -2,
            overCapacity: true,
            internalPeakUsageInBillingPeriod: 0,
            internalMaxConcurrentActiveUsersRecorded: 0,
          },
          guards: {
            canUsePrimaryWorkspaceProductFeatures: true,
            canAccessBillingAndRegularizationRoutes: true,
            canInviteSeatConsumingMembers: false,
            canActivateOrReactivateSeatConsumingMembers: false,
            expansionBlockedReason: "over_capacity_regularization",
          },
        }),
      ),
    (e) =>
      e instanceof BillingSeatExpansionBlockedError &&
      e.code === "billing_expansion_blocked_over_capacity" &&
      e.expansionBlockedReason === "over_capacity_regularization",
  )
})

test("suspensión por impago bloquea expansión", () => {
  assert.throws(
    () =>
      assertCanExpandSeatConsumptionFromPublicState(
        stubState({
          billingStatus: "suspended_non_payment",
          guards: {
            canUsePrimaryWorkspaceProductFeatures: false,
            canAccessBillingAndRegularizationRoutes: true,
            canInviteSeatConsumingMembers: false,
            canActivateOrReactivateSeatConsumingMembers: false,
            expansionBlockedReason: "suspended_non_payment",
          },
        }),
      ),
    (e) =>
      e instanceof BillingSeatExpansionBlockedError &&
      e.code === "billing_expansion_blocked_suspended_non_payment",
  )
})

test("capacidad futura alta no relaja si guards siguen bloqueando cupo actual", () => {
  assert.throws(
    () =>
      assertCanExpandSeatConsumptionFromPublicState(
        stubState({
          billingStatus: "active",
          seats: {
            includedInPlan: 3,
            additionalPaid: 0,
            currentEntitled: 3,
            scheduledEntitledFuture: 50,
            scheduledSeatChangeEffectiveAt: "2027-01-01T00:00:00.000Z",
          },
          guards: {
            canUsePrimaryWorkspaceProductFeatures: true,
            canAccessBillingAndRegularizationRoutes: true,
            canInviteSeatConsumingMembers: false,
            canActivateOrReactivateSeatConsumingMembers: false,
            expansionBlockedReason: "seat_capacity_exhausted",
          },
        }),
      ),
    (e) =>
      e instanceof BillingSeatExpansionBlockedError &&
      e.code === "billing_expansion_blocked_seat_exhausted",
  )
})

test("cancelled bloquea expansión (terminal)", () => {
  assert.throws(
    () =>
      assertCanExpandSeatConsumptionFromPublicState(
        stubState({
          billingStatus: "cancelled",
          guards: {
            canUsePrimaryWorkspaceProductFeatures: false,
            canAccessBillingAndRegularizationRoutes: true,
            canInviteSeatConsumingMembers: true,
            canActivateOrReactivateSeatConsumingMembers: true,
            expansionBlockedReason: null,
          },
        }),
      ),
    (e) =>
      e instanceof BillingSeatExpansionBlockedError &&
      e.code === "billing_expansion_blocked_commercial_terminal",
  )
})
