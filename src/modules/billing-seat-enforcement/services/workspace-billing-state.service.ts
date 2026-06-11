import { computeGraceEndsAtInclusivePattern } from "../domain/billing-period.policy.js"
import {
  deriveExpansionGuards,
  deriveGraceMessagingBand,
  deriveGraceMessagingDay,
  resolveOperationalView,
} from "../domain/billing-guards.policy.js"
import { WorkspaceBillingInvariantError } from "../domain/billing-seat-enforcement.errors.js"
import type { BillingAuditEventType } from "../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { BillingSource } from "../domain/workspace-billing-status.js"
import type { WorkspaceBillingAuditRepository } from "../persistence/workspace-billing-audit.repository.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { WorkspaceLicenseSummary } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceCatalogRepository } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { CommercialPlanKind } from "../../commercial-pricing/commercial-pricing.constants.js"
import type { WorkspacePlanContextService } from "../../commercial-pricing/workspace-plan-context.service.js"

import type { BillingNotificationPort } from "../domain/billing-notification-port.js"
import type { WorkspaceBillingPublicState } from "../domain/workspace-billing-public-state.js"

/** Solo desglose UI; `currentEntitledSeats` viene de `workspace-licenses` (fuente operativa). */
const INCLUDED_BASELINE_TEAM_V1 = 3

export type { WorkspaceBillingPublicState }
function splitPurchasedForPlan(
  plan: CommercialPlanKind,
  purchased: number,
): { includedInPlan: number; additionalPaid: number } {
  if (plan === "individual") {
    return { includedInPlan: purchased, additionalPaid: 0 }
  }
  if (purchased <= INCLUDED_BASELINE_TEAM_V1) {
    return { includedInPlan: purchased, additionalPaid: 0 }
  }
  return {
    includedInPlan: INCLUDED_BASELINE_TEAM_V1,
    additionalPaid: Math.max(0, purchased - INCLUDED_BASELINE_TEAM_V1),
  }
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

/** Preferencia: reducción interna programada (`workspace-licenses`) antes que agenda solo-Paddle. */
export function mergeScheduledEntitlementForDisplay(row: WorkspaceBillingSnapshotProps): {
  seats: number | null
  effectiveAt: Date | null
} {
  if (row.scheduledEntitledSeats != null && row.scheduledSeatChangeEffectiveAt != null) {
    return { seats: row.scheduledEntitledSeats, effectiveAt: row.scheduledSeatChangeEffectiveAt }
  }
  if (row.paddleScheduledEntitledSeats != null && row.paddleScheduledSeatChangeEffectiveAt != null) {
    return { seats: row.paddleScheduledEntitledSeats, effectiveAt: row.paddleScheduledSeatChangeEffectiveAt }
  }
  return { seats: null, effectiveAt: null }
}

function seedSnapshot(
  workspacePublicId: string,
  license: WorkspaceLicenseSummary,
  billingSource: BillingSource,
  now: Date,
  planKey: CommercialPlanKind,
): WorkspaceBillingSnapshotProps {
  const presentation = splitPurchasedForPlan(planKey, license.seatsPurchased)

  let scheduledEntitledSeats: number | null = null
  let scheduledSeatChangeEffectiveAt: Date | null = null
  if (license.pendingSeatReduction) {
    scheduledEntitledSeats = license.pendingSeatReduction.targetPurchasedAfterRenewal
    scheduledSeatChangeEffectiveAt = license.pendingSeatReduction.appliesOn
  }

  return {
    workspacePublicId,
    billingSource,
    subscriptionExternalId: null,
    planKey,
    includedSeats: presentation.includedInPlan,
    additionalPaidSeats: presentation.additionalPaid,
    currentEntitledSeats: license.seatsPurchased,
    scheduledEntitledSeats,
    scheduledSeatChangeEffectiveAt,
    paddleScheduledEntitledSeats: null,
    paddleScheduledSeatChangeEffectiveAt: null,
    billingStatus: "active",
    gracePeriodStartsAt: null,
    gracePeriodEndsAt: null,
    suspensionEffectiveAt: null,
    peakUsageInBillingPeriod: 0,
    maxConcurrentActiveUsers: 0,
    billingCycleAnchor: license.nextRenewalDate,
    currentPeriodStartsAt: license.lastRenewalAt,
    currentPeriodEndsAt: license.nextRenewalDate,
    lastCommercialSyncAt: now,
    commercialExternalSnapshot: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** `currentEntitledSeats` opera con `WorkspaceLicense` (no uso del programado futuro). */
function applyLicenseNumbersToSnapshot(
  row: WorkspaceBillingSnapshotProps,
  license: WorkspaceLicenseSummary,
  now: Date,
  planKey: CommercialPlanKind,
): void {
  const presentation = splitPurchasedForPlan(planKey, license.seatsPurchased)
  row.planKey = planKey
  row.includedSeats = presentation.includedInPlan
  row.additionalPaidSeats = presentation.additionalPaid
  row.currentEntitledSeats = license.seatsPurchased
  if (license.pendingSeatReduction) {
    row.scheduledEntitledSeats = license.pendingSeatReduction.targetPurchasedAfterRenewal
    row.scheduledSeatChangeEffectiveAt = license.pendingSeatReduction.appliesOn
  } else {
    row.scheduledEntitledSeats = null
    row.scheduledSeatChangeEffectiveAt = null
  }
  /** `paddleScheduled*` lo gestiona solo ingesta Paddle — no borrar aquí. */
  row.billingCycleAnchor = license.nextRenewalDate
  row.currentPeriodEndsAt = license.nextRenewalDate
  if (license.lastRenewalAt) {
    row.currentPeriodStartsAt = license.lastRenewalAt
  }
  row.updatedAt = now
}

/**
 * Materialización comercial + entitlement operativo (**lectura** y transiciones v1).
 * No llama Paddle por request; webhooks/jobs actualizarán snapshots con el tiempo.
 */
export class WorkspaceBillingStateService {
  constructor(
    private readonly snapshots: WorkspaceBillingSnapshotRepository,
    private readonly audit: WorkspaceBillingAuditRepository,
    private readonly memberRepo: WorkspaceMemberRepository,
    private readonly workspaceLicenses: WorkspaceLicenseService,
    private readonly billingNotifications?: BillingNotificationPort,
    private readonly workspaceCatalog: WorkspaceCatalogRepository | null = null,
    private readonly workspacePlanContext: WorkspacePlanContextService | null = null,
  ) {}

  /** Webhook/job: fallo de renovación recurrente confirmado — inicia gracia 15 días calendario. */
  async applyPaymentRenewalFailure(workspacePublicId: string, at = new Date()): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    snap.billingStatus = "grace_period"
    snap.gracePeriodStartsAt = at
    snap.gracePeriodEndsAt = computeGraceEndsAtInclusivePattern(at)
    snap.commercialExternalSnapshot = JSON.stringify({
      kind: "payment_action_required",
      materializedAt: at.toISOString(),
    })
    snap.updatedAt = at
    snap.lastCommercialSyncAt = at
    await this.snapshots.replace(snap)
    await this.appendAudit(workspacePublicId, "grace_started", { at: at.toISOString() })
    if (snap.gracePeriodEndsAt) {
      void this.fireGraceStarted(workspacePublicId, snap.gracePeriodEndsAt)
    }
  }

  /** Webhook/job: pago regularizado. */
  async applyPaymentRecovered(workspacePublicId: string, at = new Date()): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    const priorGracePeriodEndsAt = snap.gracePeriodEndsAt
    const wasSuspended = snap.billingStatus === "suspended_non_payment"
    snap.billingStatus = "active"
    snap.gracePeriodStartsAt = null
    snap.gracePeriodEndsAt = null
    snap.suspensionEffectiveAt = null
    snap.updatedAt = at
    snap.lastCommercialSyncAt = at
    await this.snapshots.replace(snap)
    await this.appendAudit(workspacePublicId, "payment_recovered", { at: at.toISOString() })
    void this.firePaymentRecovered(workspacePublicId, { priorGracePeriodEndsAt, wasSuspended })
  }

  /**
   * Jobs / scripts: vuelve a materializar snapshot desde `workspace-licenses` (sin HTTP usuario).
   * Útil si hubo ajuste manual de licencias o tras ingestión Paddle que ya actualizó la licencia.
   */
  async reconcileSnapshotFromLicense(workspacePublicId: string, now = new Date()): Promise<void> {
    const row = await this.loadOrCreateSnapshot(workspacePublicId, now)
    await this.snapshots.replace(row)
  }

  /** Reconciliación explícita (cron/soporte): audita para trazabilidad. */
  async runManualLicenseReconcile(workspacePublicId: string, now = new Date()): Promise<void> {
    await this.reconcileSnapshotFromLicense(workspacePublicId, now)
    await this.appendAudit(workspacePublicId, "manual_license_reconcile", { at: now.toISOString() })
  }

  /**
   * Tras consultar API Paddle (reconciliación): materializa períodos comerciales + huella en `commercialExternalSnapshot`.
   * El entitlement operativo (`currentEntitledSeats`) sigue gobernado por `workspace-licenses` vía `loadOrCreateSnapshot`.
   */
  async applyPaddleCommercialFootprint(
    workspacePublicId: string,
    footprint: {
      commercialExternalSnapshot: string
      currentPeriodStartsAt: Date | null
      currentPeriodEndsAt: Date | null
      billingCycleAnchor: Date | null
    },
    at = new Date(),
  ): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    snap.commercialExternalSnapshot = footprint.commercialExternalSnapshot
    snap.lastCommercialSyncAt = at
    if (footprint.currentPeriodStartsAt !== null) {
      snap.currentPeriodStartsAt = footprint.currentPeriodStartsAt
    }
    if (footprint.currentPeriodEndsAt !== null) {
      snap.currentPeriodEndsAt = footprint.currentPeriodEndsAt
    }
    if (footprint.billingCycleAnchor !== null) {
      snap.billingCycleAnchor = footprint.billingCycleAnchor
    }
    snap.updatedAt = at
    await this.snapshots.replace(snap)
  }

  /** Webhook Paddle: persistir vínculo suscripción ↔ workspace para resolución por `sub_*`. */
  async linkSubscriptionExternalId(workspacePublicId: string, subscriptionExternalId: string, at = new Date()): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    if (snap.subscriptionExternalId === subscriptionExternalId) return
    snap.subscriptionExternalId = subscriptionExternalId
    snap.updatedAt = at
    snap.lastCommercialSyncAt = at
    await this.snapshots.replace(snap)
    await this.appendAudit(workspacePublicId, "commercial_subscription_linked", {
      subscriptionExternalId,
      at: at.toISOString(),
    })
  }

  /**
   * Capacidad futura comunicada por Paddle sin aplicar hoy en licencia (antiabuso).
   * No incrementa `currentEntitledSeats`; puede convivir con reducción interna programada en campos distintos.
   */
  async applyPaddleScheduledCapacityOnly(
    workspacePublicId: string,
    seats: number,
    effectiveAt: Date,
    at = new Date(),
  ): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    snap.paddleScheduledEntitledSeats = seats
    snap.paddleScheduledSeatChangeEffectiveAt = effectiveAt
    snap.updatedAt = at
    snap.lastCommercialSyncAt = at
    await this.snapshots.replace(snap)
    await this.appendAudit(workspacePublicId, "capacity_schedule_changed", {
      source: "paddle_future_only",
      seats,
      effectiveAt: effectiveAt.toISOString(),
      at: at.toISOString(),
    })
  }

  /** Tras aplicar capacidad vigente por Paddle, limpia agenda solo-Paddle obsoleta en snapshot. */
  async clearPaddleOnlyScheduledCapacity(workspacePublicId: string, at = new Date()): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    snap.paddleScheduledEntitledSeats = null
    snap.paddleScheduledSeatChangeEffectiveAt = null
    snap.updatedAt = at
    await this.snapshots.replace(snap)
  }

  /** Si Paddle marca suscripción activa de nuevo tras impago, recupera acceso cuando aplique política v1. */
  async recoverPaymentIfApplicable(workspacePublicId: string, at = new Date()): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    if (
      snap.billingStatus === "grace_period" ||
      snap.billingStatus === "payment_action_required" ||
      snap.billingStatus === "suspended_non_payment"
    ) {
      await this.applyPaymentRecovered(workspacePublicId, at)
    }
  }

  /** Estados terminales comerciales documentados (`cancelled` / `expired`). */
  async applyCommercialTerminated(
    workspacePublicId: string,
    terminal: "cancelled" | "expired",
    at = new Date(),
    snippet?: Record<string, unknown>,
  ): Promise<void> {
    const snap = await this.loadOrCreateSnapshot(workspacePublicId, at)
    snap.billingStatus = terminal
    snap.gracePeriodStartsAt = null
    snap.gracePeriodEndsAt = null
    snap.suspensionEffectiveAt = null
    snap.commercialExternalSnapshot = JSON.stringify({
      kind: `paddle_${terminal}`,
      materializedAt: at.toISOString(),
      ...(snippet ?? {}),
    })
    snap.updatedAt = at
    snap.lastCommercialSyncAt = at
    await this.snapshots.replace(snap)
    await this.appendAudit(workspacePublicId, "commercial_lifecycle_updated", {
      terminal,
      ...(snippet ?? {}),
      at: at.toISOString(),
    })
  }

  async appendBillingAuditEvent(
    workspacePublicId: string,
    type: BillingAuditEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.appendAudit(workspacePublicId, type, payload)
  }

  async getBillingState(workspacePublicId: string, now = new Date()): Promise<WorkspaceBillingPublicState> {
    const row = await this.loadOrCreateSnapshot(workspacePublicId, now)

    const transitioned = this.escalateExpiredGraceToSuspension(row, now)
    if (transitioned) {
      await this.snapshots.replace(row)
      await this.appendAudit(workspacePublicId, "suspended_after_grace", { at: now.toISOString() })
      await this.fireSuspendedNotification(workspacePublicId)
    }

    const activeAssignedUsers = await this.memberRepo.countActiveSeatConsumingMembers(workspacePublicId)

    const peakBefore = row.peakUsageInBillingPeriod
    const maxBefore = row.maxConcurrentActiveUsers
    row.peakUsageInBillingPeriod = Math.max(row.peakUsageInBillingPeriod, activeAssignedUsers)
    row.maxConcurrentActiveUsers = Math.max(row.maxConcurrentActiveUsers, activeAssignedUsers)
    if (row.peakUsageInBillingPeriod !== peakBefore || row.maxConcurrentActiveUsers !== maxBefore) {
      await this.appendAudit(workspacePublicId, "period_peak_updated", {
        peak: row.peakUsageInBillingPeriod,
        maxConcurrent: row.maxConcurrentActiveUsers,
      })
    }

    const op = resolveOperationalView(row, now)
    const availableRaw = row.currentEntitledSeats - activeAssignedUsers
    const availableSeats = Math.max(0, availableRaw)

    const guards = deriveExpansionGuards({
      snapshot: row,
      activeAssignedUsers,
      currentEntitledSeats: row.currentEntitledSeats,
      availableSeatsRaw: availableRaw,
      operationalView: op,
    })

    await this.snapshots.replace(row)

    const graceWindow =
      !!row.gracePeriodStartsAt &&
      !!row.gracePeriodEndsAt &&
      now >= row.gracePeriodStartsAt &&
      now <= row.gracePeriodEndsAt

    const messagingGraceDay =
      row.gracePeriodStartsAt && row.gracePeriodEndsAt && graceWindow
        ? deriveGraceMessagingDay(now, row.gracePeriodStartsAt)
        : null

    const merged = mergeScheduledEntitlementForDisplay(row)

    const commercialPlanTier = this.workspacePlanContext
      ? await this.workspacePlanContext.resolvePlanTier(workspacePublicId)
      : "estandar"

    return {
      workspacePublicId: row.workspacePublicId,
      billingSource: row.billingSource,
      billingStatus: row.billingStatus,
      commercialExternalSnapshot: row.commercialExternalSnapshot,
      commercialPlanTier,
      planKey: row.planKey,
      seats: {
        includedInPlan: row.includedSeats,
        additionalPaid: row.additionalPaidSeats,
        currentEntitled: row.currentEntitledSeats,
        scheduledEntitledFuture: merged.seats,
        scheduledSeatChangeEffectiveAt: iso(merged.effectiveAt),
      },
      usage: {
        activeAssignedUsers,
        availableSeats,
        overCapacity: guards.overCapacity,
        internalPeakUsageInBillingPeriod: row.peakUsageInBillingPeriod,
        internalMaxConcurrentActiveUsersRecorded: row.maxConcurrentActiveUsers,
      },
      grace: {
        isInGraceWindow: graceWindow,
        gracePeriodStartsAt: iso(row.gracePeriodStartsAt),
        gracePeriodEndsAt: iso(row.gracePeriodEndsAt),
        messagingGraceDay,
        messagingBand: deriveGraceMessagingBand(messagingGraceDay),
      },
      guards,
      timestamps: {
        lastCommercialSyncAt: iso(row.lastCommercialSyncAt),
        billingCycleAnchor: iso(row.billingCycleAnchor),
        currentPeriodStartsAt: iso(row.currentPeriodStartsAt),
        currentPeriodEndsAt: iso(row.currentPeriodEndsAt),
      },
    }
  }

  /**
   * Job batch: materializa suspensión cuando la gracia ya expiró sin depender de lecturas HTTP.
   * Idempotente con `getBillingState` (misma función de escalado).
   */
  async sweepExpiredGraceSuspensions(now = new Date()): Promise<void> {
    const rows = await this.snapshots.findSnapshotsWithGraceExpiredBefore(now)
    for (const row of rows) {
      const transitioned = this.escalateExpiredGraceToSuspension(row, now)
      if (!transitioned) continue
      await this.snapshots.replace(row)
      await this.appendAudit(row.workspacePublicId, "suspended_after_grace", {
        at: now.toISOString(),
        source: "billing_suspension_sweep",
      })
      await this.fireSuspendedNotification(row.workspacePublicId)
    }
  }

  private escalateExpiredGraceToSuspension(row: WorkspaceBillingSnapshotProps, now: Date): boolean {
    if (
      (row.billingStatus !== "grace_period" && row.billingStatus !== "payment_action_required") ||
      !row.gracePeriodEndsAt
    ) {
      return false
    }
    if (now <= row.gracePeriodEndsAt) {
      return false
    }
    row.billingStatus = "suspended_non_payment"
    row.suspensionEffectiveAt ??= now
    row.updatedAt = now
    return true
  }

  private async resolveCommercialPlanKind(
    workspacePublicId: string,
    license: WorkspaceLicenseSummary,
  ): Promise<CommercialPlanKind> {
    const row = await this.workspaceCatalog?.findByPublicId(workspacePublicId)
    if (row) return row.modality
    return license.seatsPurchased <= 1 ? "individual" : "team"
  }

  /**
   * Materializa snapshot de facturación (igual que en rutas de lectura) para orquestación comercial
   * que necesita `billingSource`, `subscriptionExternalId`, etc.
   */
  async materializeWorkspaceBillingSnapshot(
    workspacePublicId: string,
    now = new Date(),
  ): Promise<WorkspaceBillingSnapshotProps> {
    return this.loadOrCreateSnapshot(workspacePublicId, now)
  }

  private async loadOrCreateSnapshot(workspacePublicId: string, now: Date): Promise<WorkspaceBillingSnapshotProps> {
    const license = await this.workspaceLicenses.getSummary(workspacePublicId)
    if (!license) {
      throw new WorkspaceBillingInvariantError("workspace_license_not_found")
    }

    const planKey = await this.resolveCommercialPlanKind(workspacePublicId, license)

    let row = await this.snapshots.findByWorkspacePublicId(workspacePublicId)

    if (!row) {
      row = seedSnapshot(workspacePublicId, license, "paddle", now, planKey)
      await this.snapshots.insertInitial(row)
      await this.appendAudit(workspacePublicId, "commercial_sync_applied", { seeded: true })
    }

    applyLicenseNumbersToSnapshot(row, license, now, planKey)
    return row
  }

  private async appendAudit(workspacePublicId: string, type: BillingAuditEventType, payload: Record<string, unknown>) {
    await this.audit.append(workspacePublicId, type, payload)
  }

  private fireGraceStarted(workspacePublicId: string, gracePeriodEndsAt: Date): void {
    if (!this.billingNotifications) return
    void this.billingNotifications
      .onGraceStarted(workspacePublicId, gracePeriodEndsAt)
      .catch((err: unknown) =>
        console.error(
          JSON.stringify({
            level: "error",
            msg: "billing_notification_hook_failed",
            hook: "onGraceStarted",
            workspacePublicId,
            detail: err instanceof Error ? err.message : String(err),
          }),
        ),
      )
  }

  private async fireSuspendedNotification(workspacePublicId: string): Promise<void> {
    if (!this.billingNotifications) return
    try {
      await this.billingNotifications.onSuspendedNonPayment(workspacePublicId)
    } catch (err: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "billing_notification_hook_failed",
          hook: "onSuspendedNonPayment",
          workspacePublicId,
          detail: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  private firePaymentRecovered(
    workspacePublicId: string,
    ctx: { priorGracePeriodEndsAt: Date | null; wasSuspended: boolean },
  ): void {
    if (!this.billingNotifications) return
    void this.billingNotifications
      .onPaymentRecovered(workspacePublicId, {
        priorGracePeriodEndsAt: ctx.priorGracePeriodEndsAt,
        wasSuspended: ctx.wasSuspended,
      })
      .catch((err: unknown) =>
        console.error(
          JSON.stringify({
            level: "error",
            msg: "billing_notification_hook_failed",
            hook: "onPaymentRecovered",
            workspacePublicId,
            detail: err instanceof Error ? err.message : String(err),
          }),
        ),
      )
  }
}
