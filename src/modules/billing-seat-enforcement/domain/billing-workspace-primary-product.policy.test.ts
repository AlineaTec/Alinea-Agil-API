import assert from "node:assert/strict"
import { test } from "node:test"

import { BillingWorkspacePrimaryProductBlockedError } from "./billing-workspace-primary-product.errors.js"
import {
  assertCanUsePrimaryWorkspaceProductFeatures,
  isBillingPrimaryProductMutationExempt,
} from "./billing-workspace-primary-product.policy.js"
import type { WorkspaceBillingPublicState } from "./workspace-billing-public-state.js"

function state(partial: Partial<WorkspaceBillingPublicState>): WorkspaceBillingPublicState {
  return {
    workspacePublicId: "00000000-0000-4000-8000-000000000001",
    billingSource: "paddle",
    billingStatus: "active",
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
      activeAssignedUsers: 1,
      availableSeats: 2,
      overCapacity: false,
      internalPeakUsageInBillingPeriod: 1,
      internalMaxConcurrentActiveUsersRecorded: 1,
    },
    grace: {
      isInGraceWindow: false,
      gracePeriodStartsAt: null,
      gracePeriodEndsAt: null,
      messagingGraceDay: null,
    },
    guards: {
      canUsePrimaryWorkspaceProductFeatures: true,
      canAccessBillingAndRegularizationRoutes: true,
      canInviteSeatConsumingMembers: true,
      canActivateOrReactivateSeatConsumingMembers: true,
      expansionBlockedReason: null,
      overCapacity: false,
    },
    timestamps: {
      lastCommercialSyncAt: null,
      billingCycleAnchor: null,
      currentPeriodStartsAt: null,
      currentPeriodEndsAt: null,
    },
    ...partial,
  }
}

test("isBillingPrimaryProductMutationExempt: billing, license, settings, deactivate, release-seat", () => {
  assert.equal(
    isBillingPrimaryProductMutationExempt("/v1/workspaces/u/billing/state"),
    true,
  )
  assert.equal(isBillingPrimaryProductMutationExempt("/v1/workspaces/u/billing/portal-session"), true)
  assert.equal(isBillingPrimaryProductMutationExempt("/v1/workspaces/u/license/increase-seats"), true)
  assert.equal(isBillingPrimaryProductMutationExempt("/v1/workspaces/u/settings/display-name"), true)
  assert.equal(
    isBillingPrimaryProductMutationExempt("/v1/workspaces/u/members/aaa/deactivate"),
    true,
  )
  assert.equal(
    isBillingPrimaryProductMutationExempt("/v1/workspaces/u/members/bbb/release-seat"),
    true,
  )
  assert.equal(isBillingPrimaryProductMutationExempt("/v1/workspaces/u/projects/p/scrum-backlog/items"), false)
})

test("assertCanUsePrimaryWorkspaceProductFeatures: ok when guard allows", () => {
  assert.doesNotThrow(() =>
    assertCanUsePrimaryWorkspaceProductFeatures(
      state({
        billingStatus: "active",
        guards: {
          canUsePrimaryWorkspaceProductFeatures: true,
          canAccessBillingAndRegularizationRoutes: true,
          canInviteSeatConsumingMembers: false,
          canActivateOrReactivateSeatConsumingMembers: false,
          expansionBlockedReason: "over_capacity_regularization",
          overCapacity: true,
        },
        usage: { ...state({}).usage, overCapacity: true },
      }),
    ),
  )
})

test("assertCanUsePrimaryWorkspaceProductFeatures: suspended_non_payment throws discriminated error", () => {
  assert.throws(
    () =>
      assertCanUsePrimaryWorkspaceProductFeatures(
        state({
          billingStatus: "suspended_non_payment",
          guards: {
            ...state({}).guards,
            canUsePrimaryWorkspaceProductFeatures: false,
            expansionBlockedReason: "suspended_non_payment",
          },
        }),
      ),
    (e: unknown) => {
      assert.ok(e instanceof BillingWorkspacePrimaryProductBlockedError)
      const err = e as BillingWorkspacePrimaryProductBlockedError
      assert.equal(err.code, "billing_workspace_primary_product_suspended_non_payment")
      assert.equal(err.reason, "suspended_non_payment")
      return true
    },
  )
})

test("assertCanUsePrimaryWorkspaceProductFeatures: cancelled throws commercial_terminal", () => {
    assert.throws(
    () =>
      assertCanUsePrimaryWorkspaceProductFeatures(
        state({
          billingStatus: "cancelled",
          guards: {
            ...state({}).guards,
            canUsePrimaryWorkspaceProductFeatures: false,
            expansionBlockedReason: null,
          },
        }),
      ),
    (e: unknown) => {
      assert.ok(e instanceof BillingWorkspacePrimaryProductBlockedError)
      const err = e as BillingWorkspacePrimaryProductBlockedError
      assert.equal(err.code, "billing_workspace_primary_product_commercial_terminal")
      assert.equal(err.reason, "commercial_terminal")
      assert.equal(err.billingStatus, "cancelled")
      return true
    },
  )
})

test("assertCanUsePrimaryWorkspaceProductFeatures: expired throws commercial_terminal", () => {
    assert.throws(
    () =>
      assertCanUsePrimaryWorkspaceProductFeatures(
        state({
          billingStatus: "expired",
          guards: {
            ...state({}).guards,
            canUsePrimaryWorkspaceProductFeatures: false,
            expansionBlockedReason: null,
          },
        }),
      ),
    (e: unknown) => {
      assert.ok(e instanceof BillingWorkspacePrimaryProductBlockedError)
      assert.equal((e as BillingWorkspacePrimaryProductBlockedError).billingStatus, "expired")
      return true
    },
  )
})
