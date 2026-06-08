import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import type { PaddleWebhookProcessedRepository } from "../persistence/paddle-webhook-processed.repository.js"
import type { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import { SeatCapacityInvariantError } from "../../workspace-licenses/domain/seat-capacity.policy.js"
import { WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID } from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import {
  extractWorkspacePublicIdFromCustomData,
  extractSubscriptionId,
  parseOccurredAt,
  deriveTrustedEntitlementFromPaddlePayload,
} from "./paddle-webhook-mapper.js"
import { loadPaddlePriceCatalogFromEnv } from "../../commercial-pricing/paddle-price-catalog.js"
import { applyPaddleSubscriptionCommercialEffects } from "./paddle-subscription-commercial-effects.js"
import type { PaymentReceiptWebhookBridge } from "../../payment-receipts/services/payment-receipt-webhook.bridge.js"

const HANDLED_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.past_due",
  "subscription.activated",
  "subscription.resumed",
  "subscription.canceled",
  "subscription.paused",
  "transaction.completed",
  "transaction.payment_failed",
  "transaction.past_due",
])

export type PaddleWebhookHandleResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: 400; body: Record<string, unknown> }

export class PaddleBillingWebhookIngestionService {
  constructor(
    private readonly snapshots: WorkspaceBillingSnapshotRepository,
    private readonly processed: PaddleWebhookProcessedRepository,
    private readonly billing: WorkspaceBillingStateService,
    private readonly workspaceLicenses: WorkspaceLicenseService,
    private readonly paymentReceiptBridge: PaymentReceiptWebhookBridge | null = null,
  ) {}

  async handleEnvelope(envelope: Record<string, unknown>, receivedAt: Date): Promise<PaddleWebhookHandleResult> {
    const eventId = envelope.event_id
    const eventType = envelope.event_type
    if (typeof eventId !== "string" || typeof eventType !== "string") {
      return { status: 400, body: { error: "invalid_envelope" } }
    }

    const occurredAt = parseOccurredAt(envelope) ?? receivedAt

    if (!HANDLED_EVENT_TYPES.has(eventType)) {
      return { status: 200, body: { ok: true, ignored: true, event_type: eventType } }
    }

    const data = envelope.data
    if (!data || typeof data !== "object") {
      return { status: 200, body: { ok: true, ignored: true, reason: "missing_data" } }
    }

    const payload = data as Record<string, unknown>
    const workspacePublicId = await this.resolveWorkspacePublicId(payload, eventType)
    if (!workspacePublicId) {
      if (eventType === "transaction.completed" && this.paymentReceiptBridge) {
        try {
          await this.paymentReceiptBridge.recordOrphanPaddleTransactionCompleted({
            sourceEventId: eventId,
            sourceEventType: eventType,
            receivedAt: occurredAt,
            payload,
          })
        } catch (e) {
          console.warn("[paddle-webhook] payment receipt orphan record failed", e)
        }
      }
      console.warn("[paddle-webhook] orphan event (no workspace resolution)", { eventId, eventType })
      return { status: 200, body: { ok: true, orphan: true, event_id: eventId } }
    }

    const claimed = await this.processed.tryClaimEvent(eventId, { eventType, receivedAt })
    if (!claimed) {
      return { status: 200, body: { ok: true, duplicate: true, event_id: eventId } }
    }

    try {
      const summary = await this.dispatch(
        workspacePublicId,
        eventType,
        payload,
        occurredAt,
        eventId,
        eventType,
      )
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_webhook_applied", {
        event_id: eventId,
        event_type: eventType,
        occurred_at: occurredAt.toISOString(),
        ...summary,
      })
      return { status: 200, body: { ok: true, workspacePublicId, ...summary } }
    } catch (err: unknown) {
      if (err instanceof SeatCapacityInvariantError) {
        console.warn("[paddle-webhook] seat invariant blocked trusted sync — manual reconcile required", {
          eventId,
          eventType,
          workspacePublicId,
          message: err.message,
        })
        await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_webhook_ignored", {
          event_id: eventId,
          event_type: eventType,
          reason: "seat_invariant_conflict",
          detail: err.message,
        })
        return {
          status: 200,
          body: { ok: true, workspacePublicId, seat_invariant_conflict: true },
        }
      }
      throw err
    }
  }

  private async resolveWorkspacePublicId(data: Record<string, unknown>, eventType: string): Promise<string | null> {
    const fromCd = extractWorkspacePublicIdFromCustomData(data)
    if (fromCd) return fromCd
    const subId = extractSubscriptionId(data, eventType)
    if (!subId) return null
    const snap = await this.snapshots.findBySubscriptionExternalId(subId)
    return snap?.workspacePublicId ?? null
  }

  private async dispatch(
    workspacePublicId: string,
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
    envelopeEventId: string,
    envelopeEventType: string,
  ): Promise<Record<string, unknown>> {
    if (eventType.startsWith("subscription.")) {
      return applyPaddleSubscriptionCommercialEffects(
        this.billing,
        this.workspaceLicenses,
        workspacePublicId,
        payload,
        occurredAt,
        { webhookEventType: eventType },
      )
    }
    if (eventType === "transaction.payment_failed" || eventType === "transaction.past_due") {
      const sid = extractSubscriptionId(payload, eventType)
      if (sid) await this.billing.linkSubscriptionExternalId(workspacePublicId, sid, occurredAt)
      await this.billing.applyPaymentRenewalFailure(workspacePublicId, occurredAt)
      return { effect: "renewal_failure_grace", via: eventType }
    }
    if (eventType === "transaction.completed") {
      const subId = extractSubscriptionId(payload, eventType)
      if (subId) await this.billing.linkSubscriptionExternalId(workspacePublicId, subId, occurredAt)
      await this.billing.recoverPaymentIfApplicable(workspacePublicId, occurredAt)
      const catalog = loadPaddlePriceCatalogFromEnv()
      const derived = deriveTrustedEntitlementFromPaddlePayload(payload, catalog)
      const qty = derived.entitledSeats
      let seatInvariantError: SeatCapacityInvariantError | null = null
      if (qty !== null && qty >= 1) {
        try {
          await this.workspaceLicenses.applyTrustedAbsoluteSeatsPurchased(workspacePublicId, qty, {
            actorUserPublicId: WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
          })
          await this.billing.clearPaddleOnlyScheduledCapacity(workspacePublicId, occurredAt)
          await this.billing.reconcileSnapshotFromLicense(workspacePublicId, occurredAt)
          await this.billing.appendBillingAuditEvent(workspacePublicId, "capacity_current_changed", {
            source: "paddle_transaction_completed",
            seatsPurchased: qty,
            entitlement_derivation: {
              planKind: derived.planKind,
              used_legacy_sum: derived.usedLegacyQuantitySum,
              issues: derived.issues,
            },
            at: occurredAt.toISOString(),
          })
        } catch (err) {
          if (err instanceof SeatCapacityInvariantError) {
            seatInvariantError = err
          } else {
            throw err
          }
        }
      } else if (derived.issues.length > 0) {
        await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_webhook_ignored", {
          reason: "transaction_completed_items_unmapped",
          issues: derived.issues,
          used_legacy_sum: derived.usedLegacyQuantitySum,
        })
      }

      if (this.paymentReceiptBridge) {
        try {
          await this.paymentReceiptBridge.tryEmitFromPaddleTransactionCompleted({
            workspacePublicId,
            payload,
            occurredAt,
            sourceEventId: envelopeEventId,
            sourceEventType: envelopeEventType,
          })
        } catch (e) {
          console.warn("[paddle-webhook] payment receipt emission failed", e)
        }
      }

      if (seatInvariantError !== null) {
        throw seatInvariantError
      }
      return { effect: "transaction_completed" }
    }
    return { effect: "noop" }
  }
}
