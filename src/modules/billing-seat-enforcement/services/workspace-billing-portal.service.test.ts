import assert from "node:assert/strict"
import test from "node:test"
import { WorkspaceBillingInvariantError } from "../domain/billing-seat-enforcement.errors.js"
import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import {
  WorkspaceBillingPortalManualBillingError,
  WorkspaceBillingPortalMissingLinkError,
  WorkspaceBillingPortalPaddleUnavailableError,
} from "../domain/billing-portal.errors.js"
import { resolveWorkspaceBillingPortalUrl } from "./workspace-billing-portal.service.js"

function baseSnapshot(overrides: Partial<WorkspaceBillingSnapshotProps> = {}): WorkspaceBillingSnapshotProps {
  const now = new Date()
  return {
    workspacePublicId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    billingSource: "paddle",
    subscriptionExternalId: "sub_test_123",
    planKey: "default",
    includedSeats: 1,
    additionalPaidSeats: 0,
    currentEntitledSeats: 5,
    scheduledEntitledSeats: null,
    scheduledSeatChangeEffectiveAt: null,
    paddleScheduledEntitledSeats: null,
    paddleScheduledSeatChangeEffectiveAt: null,
    billingStatus: "active",
    gracePeriodStartsAt: null,
    gracePeriodEndsAt: null,
    suspensionEffectiveAt: null,
    peakUsageInBillingPeriod: 0,
    maxConcurrentActiveUsers: 0,
    billingCycleAnchor: null,
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
    lastCommercialSyncAt: null,
    commercialExternalSnapshot: null,
    updatedAt: now,
    createdAt: now,
    ...overrides,
  }
}

test("resolveWorkspaceBillingPortalUrl rechaza snapshot ausente", async () => {
  await assert.rejects(() => resolveWorkspaceBillingPortalUrl(null, "k_test"), WorkspaceBillingInvariantError)
})

test("resolveWorkspaceBillingPortalUrl rechaza billing manual", async () => {
  await assert.rejects(
    () => resolveWorkspaceBillingPortalUrl(baseSnapshot({ billingSource: "manual" }), "k_test"),
    WorkspaceBillingPortalManualBillingError,
  )
})

test("resolveWorkspaceBillingPortalUrl rechaza sin subscriptionExternalId", async () => {
  await assert.rejects(
    () => resolveWorkspaceBillingPortalUrl(baseSnapshot({ subscriptionExternalId: null }), "k_test"),
    WorkspaceBillingPortalMissingLinkError,
  )
})

test("resolveWorkspaceBillingPortalUrl rechaza sin API key", async () => {
  await assert.rejects(
    () => resolveWorkspaceBillingPortalUrl(baseSnapshot(), undefined),
    WorkspaceBillingPortalPaddleUnavailableError,
  )
})

test("resolveWorkspaceBillingPortalUrl propaga fallo Paddle al obtener customer_id", async () => {
  await assert.rejects(
    () =>
      resolveWorkspaceBillingPortalUrl(baseSnapshot(), "k_test", {
        fetchSubscriptionCustomerId: async () => ({ ok: false, httpStatus: 404, bodySnippet: "x" }),
        createPortalSession: async () => ({ ok: false, httpStatus: 500, bodySnippet: "y" }),
      }),
    (err: unknown) =>
      err instanceof WorkspaceBillingPortalPaddleUnavailableError &&
      err.paddleHttpStatus === 404,
  )
})

test("resolveWorkspaceBillingPortalUrl propaga fallo Paddle al crear sesión portal", async () => {
  await assert.rejects(
    () =>
      resolveWorkspaceBillingPortalUrl(baseSnapshot(), "k_test", {
        fetchSubscriptionCustomerId: async () => ({ ok: true, customerId: "ctm_1" }),
        createPortalSession: async () => ({ ok: false, httpStatus: 422, bodySnippet: "bad" }),
      }),
    (err: unknown) =>
      err instanceof WorkspaceBillingPortalPaddleUnavailableError &&
      err.paddleHttpStatus === 422,
  )
})

test("resolveWorkspaceBillingPortalUrl adjunta paddleApiError al crear sesión portal", async () => {
  await assert.rejects(
    () =>
      resolveWorkspaceBillingPortalUrl(baseSnapshot(), "k_test", {
        fetchSubscriptionCustomerId: async () => ({ ok: true, customerId: "ctm_1" }),
        createPortalSession: async () => ({
          ok: false,
          httpStatus: 403,
          bodySnippet: "{}",
          paddleApiError: {
            code: "paddle_billing_not_enabled",
            detail: "Paddle Billing is not activated for this account.",
            requestId: "req_01",
          },
        }),
      }),
    (err: unknown) =>
      err instanceof WorkspaceBillingPortalPaddleUnavailableError &&
      err.paddleHttpStatus === 403 &&
      err.paddleApiError?.code === "paddle_billing_not_enabled" &&
      err.paddleApiError?.requestId === "req_01",
  )
})

test("resolveWorkspaceBillingPortalUrl devuelve portalUrl cuando Paddle responde OK", async () => {
  const r = await resolveWorkspaceBillingPortalUrl(baseSnapshot(), "k_test", {
    fetchSubscriptionCustomerId: async () => ({ ok: true, customerId: "ctm_x" }),
    createPortalSession: async () => ({
      ok: true,
      portalUrl: "https://customer-portal.paddle.com/example-token",
    }),
  })
  assert.equal(r.portalUrl, "https://customer-portal.paddle.com/example-token")
})
