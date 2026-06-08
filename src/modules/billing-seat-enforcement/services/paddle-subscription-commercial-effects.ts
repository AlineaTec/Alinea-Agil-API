import {
  deriveCommercialSeatEntitlementFromPaddleItems,
  extractPaddleItemsArrayFromPayload,
  loadPaddlePriceCatalogFromEnv,
} from "../../commercial-pricing/paddle-price-catalog.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import { WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID } from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"
import {
  deriveTrustedEntitlementFromPaddlePayload,
  extractScheduledFutureSeatIncrease,
} from "./paddle-webhook-mapper.js"

/**
 * Efectos comerciales alineados a `dispatchSubscription` en ingestión webhook.
 * Usado por webhooks y por reconciliación API Paddle (no por request HTTP usuario).
 */
export async function applyPaddleSubscriptionCommercialEffects(
  billing: WorkspaceBillingStateService,
  workspaceLicenses: WorkspaceLicenseService,
  workspacePublicId: string,
  payload: Record<string, unknown>,
  occurredAt: Date,
  context?: { webhookEventType?: string },
): Promise<Record<string, unknown>> {
  const catalog = loadPaddlePriceCatalogFromEnv()
  const subId = typeof payload.id === "string" ? payload.id : null
  if (!subId) return { effect: "subscription_missing_id" }

  await billing.linkSubscriptionExternalId(workspacePublicId, subId, occurredAt)

  const status = typeof payload.status === "string" ? payload.status : ""
  const license = await workspaceLicenses.getSummary(workspacePublicId)
  const currentPurchased = license?.seatsPurchased ?? null

  const scheduledFuture =
    currentPurchased !== null
      ? extractScheduledFutureSeatIncrease(payload, occurredAt, currentPurchased, catalog)
      : extractScheduledFutureSeatIncrease(payload, occurredAt, null, catalog)

  if (status === "paused") {
    await billing.appendBillingAuditEvent(workspacePublicId, "paddle_webhook_ignored", {
      reason: "paused_not_mapped_v1",
      event_type: context?.webhookEventType ?? "paddle_subscription_effects",
    })
    return { effect: "ignored_paused" }
  }

  if (status === "past_due") {
    await billing.applyPaymentRenewalFailure(workspacePublicId, occurredAt)
    return { effect: "renewal_failure_grace" }
  }

  if (status === "canceled") {
    await billing.applyCommercialTerminated(workspacePublicId, "cancelled", occurredAt, { paddleStatus: status })
    return { effect: "cancelled" }
  }

  if (status === "active") {
    await billing.recoverPaymentIfApplicable(workspacePublicId, occurredAt)
  }

  if (status === "active" && scheduledFuture) {
    await billing.applyPaddleScheduledCapacityOnly(
      workspacePublicId,
      scheduledFuture.seats,
      scheduledFuture.effectiveAt,
      occurredAt,
    )
    return {
      effect: "scheduled_capacity_only",
      seats: scheduledFuture.seats,
      paddle_issues: catalog ? extractScheduledDerivationIssues(payload, catalog) : [],
    }
  }

  const derived = deriveTrustedEntitlementFromPaddlePayload(payload, catalog)

  if (derived.entitledSeats === null) {
    if (status === "active") {
      await billing.appendBillingAuditEvent(workspacePublicId, "paddle_webhook_ignored", {
        reason: "subscription_items_unmapped_or_ambiguous",
        issues: derived.issues,
        used_legacy_sum: derived.usedLegacyQuantitySum,
        event_type: context?.webhookEventType ?? "paddle_subscription_effects",
      })
    }
    return { effect: "subscription_capacity_unmapped", issues: derived.issues }
  }

  if (derived.issues.length > 0) {
    await billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_semantics_note", {
      issues: derived.issues,
      team_base_quantity_observed: derived.teamBaseQuantityObserved,
      used_legacy_sum: derived.usedLegacyQuantitySum,
    })
  }

  const qty = derived.entitledSeats
  if (status === "active" && qty >= 1 && currentPurchased !== null && qty !== currentPurchased) {
    await workspaceLicenses.applyTrustedAbsoluteSeatsPurchased(workspacePublicId, qty, {
      actorUserPublicId: WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
    })
    await billing.clearPaddleOnlyScheduledCapacity(workspacePublicId, occurredAt)
    await billing.reconcileSnapshotFromLicense(workspacePublicId, occurredAt)
    await billing.appendBillingAuditEvent(workspacePublicId, "capacity_current_changed", {
      source: "paddle_subscription_items",
      seatsPurchased: qty,
      entitlement_derivation: {
        planKind: derived.planKind,
        used_legacy_sum: derived.usedLegacyQuantitySum,
        issues: derived.issues,
      },
      at: occurredAt.toISOString(),
    })
    return { effect: "capacity_sync", seatsPurchased: qty }
  }

  if (status === "active") {
    return { effect: "active_no_capacity_delta" }
  }

  return { effect: "subscription_noop", status }
}

function extractScheduledDerivationIssues(
  payload: Record<string, unknown>,
  catalog: NonNullable<ReturnType<typeof loadPaddlePriceCatalogFromEnv>>,
): string[] {
  const sch = payload.scheduled_change
  if (!sch || typeof sch !== "object") return []
  const items = extractPaddleItemsArrayFromPayload(sch as Record<string, unknown>)
  if (items.length < 1) return []
  return deriveCommercialSeatEntitlementFromPaddleItems(items, catalog).issues
}
