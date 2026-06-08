import { fetchPaddleSubscriptionData } from "../../../integrations/paddle/fetch-paddle-subscription.js"
import { SeatCapacityInvariantError } from "../../workspace-licenses/domain/seat-capacity.policy.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import { applyPaddleSubscriptionCommercialEffects } from "./paddle-subscription-commercial-effects.js"
import {
  buildPaddleApiReconcileFingerprint,
  extractPaddleCommercialCycleFields,
} from "./paddle-subscription-commercial-fields.js"
import type { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"

export type PaddleCommercialReconcileResult =
  | { status: "skipped"; reason: "manual_billing" | "no_subscription_link" | "missing_api_key" }
  | { status: "failed"; reason: "paddle_unreachable"; httpStatus: number; bodySnippet: string }
  | { status: "license_conflict"; detail: string }
  | { status: "applied"; commercialEffect: Record<string, unknown> }

export type PaddleSubscriptionFetchFn = typeof fetchPaddleSubscriptionData

/**
 * Reconciliación conservadora Paddle ↔ snapshot interno (sin HTTP usuario).
 * Solo workspaces `billingSource=paddle` con `subscriptionExternalId`; no sustituye la lectura del snapshot en cada request.
 */
export class PaddleCommercialReconcileService {
  constructor(
    private readonly billing: WorkspaceBillingStateService,
    private readonly workspaceLicenses: WorkspaceLicenseService,
    private readonly snapshots: WorkspaceBillingSnapshotRepository,
    private readonly fetchSubscription: PaddleSubscriptionFetchFn,
    private readonly getApiKey: () => string | undefined,
  ) {}

  /**
   * Flujo: licencias → snapshot materializado; efectos comerciales como webhook `subscription.updated`;
   * huella API + períodos en `commercialExternalSnapshot` / timestamps comerciales.
   */
  async reconcileWorkspace(workspacePublicId: string, now = new Date()): Promise<PaddleCommercialReconcileResult> {
    await this.billing.reconcileSnapshotFromLicense(workspacePublicId, now)

    const row = await this.snapshots.findByWorkspacePublicId(workspacePublicId)
    if (!row) {
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_failed", {
        reason: "snapshot_missing_after_license_reconcile",
        at: now.toISOString(),
      })
      return { status: "failed", reason: "paddle_unreachable", httpStatus: 500, bodySnippet: "snapshot_missing" }
    }

    if (row.billingSource !== "paddle") {
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_skipped", {
        reason: "manual_billing",
        at: now.toISOString(),
      })
      return { status: "skipped", reason: "manual_billing" }
    }

    const subId = row.subscriptionExternalId?.trim()
    if (!subId) {
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_divergence_noted", {
        kind: "missing_subscription_link_on_snapshot",
        at: now.toISOString(),
      })
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_skipped", {
        reason: "no_subscription_link",
        at: now.toISOString(),
      })
      return { status: "skipped", reason: "no_subscription_link" }
    }

    const apiKey = this.getApiKey()?.trim()
    if (!apiKey) {
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_skipped", {
        reason: "missing_api_key",
        at: now.toISOString(),
      })
      return { status: "skipped", reason: "missing_api_key" }
    }

    const fetched = await this.fetchSubscription(subId, apiKey)
    if (!fetched.ok) {
      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_failed", {
        subscriptionExternalId: subId,
        httpStatus: fetched.httpStatus,
        bodySnippet: fetched.bodySnippet.slice(0, 400),
        at: now.toISOString(),
      })
      return {
        status: "failed",
        reason: "paddle_unreachable",
        httpStatus: fetched.httpStatus,
        bodySnippet: fetched.bodySnippet,
      }
    }

    const payload = fetched.data

    try {
      const commercialEffect = await applyPaddleSubscriptionCommercialEffects(
        this.billing,
        this.workspaceLicenses,
        workspacePublicId,
        payload,
        now,
      )

      const fingerprint = buildPaddleApiReconcileFingerprint(payload, now)
      const cycle = extractPaddleCommercialCycleFields(payload)

      await this.billing.applyPaddleCommercialFootprint(
        workspacePublicId,
        {
          commercialExternalSnapshot: fingerprint,
          currentPeriodStartsAt: cycle.currentPeriodStartsAt,
          currentPeriodEndsAt: cycle.currentPeriodEndsAt,
          billingCycleAnchor: cycle.billingCycleAnchor,
        },
        now,
      )

      await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_applied", {
        subscriptionExternalId: subId,
        commercialEffect,
        at: now.toISOString(),
      })

      return { status: "applied", commercialEffect }
    } catch (err: unknown) {
      if (err instanceof SeatCapacityInvariantError) {
        await this.billing.appendBillingAuditEvent(workspacePublicId, "paddle_commercial_reconcile_license_conflict", {
          subscriptionExternalId: subId,
          detail: err.message,
          at: now.toISOString(),
        })
        return { status: "license_conflict", detail: err.message }
      }
      throw err
    }
  }

  /** Stub para cron ligero: hasta `limit` workspaces con vínculo Paddle (orden no garantizado). */
  async runLightPeriodic(now = new Date(), limit = 25): Promise<{
    processed: number
    results: PaddleCommercialReconcileResult[]
  }> {
    const ids = await this.snapshots.findPaddleLinkedWorkspacePublicIds(limit)
    const results: PaddleCommercialReconcileResult[] = []
    for (const id of ids) {
      results.push(await this.reconcileWorkspace(id, now))
    }
    return { processed: ids.length, results }
  }
}

export function createPaddleCommercialReconcileService(options: {
  workspaceBillingStateService: WorkspaceBillingStateService
  workspaceLicenseService: WorkspaceLicenseService
  workspaceBillingSnapshotRepository: WorkspaceBillingSnapshotRepository
  fetchSubscription?: PaddleSubscriptionFetchFn
  getApiKey?: () => string | undefined
}): PaddleCommercialReconcileService {
  return new PaddleCommercialReconcileService(
    options.workspaceBillingStateService,
    options.workspaceLicenseService,
    options.workspaceBillingSnapshotRepository,
    options.fetchSubscription ?? fetchPaddleSubscriptionData,
    options.getApiKey ?? (() => process.env.PADDLE_API_KEY?.trim()),
  )
}
