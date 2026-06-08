import type { BillingSource, WorkspaceBillingStatus } from "./workspace-billing-status.js"

/** Evento persistente solo para soporte/trazabilidad (no muestra payloads Paddle crudos completos aquí). */
export type BillingAuditSummary = {
  eventType: BillingAuditEventType
  workspacePublicId: string
  createdAt: Date
  payloadSnippet?: Record<string, unknown>
}

export const BILLING_AUDIT_EVENT_TYPES = [
  "commercial_sync_applied",
  "grace_started",
  "grace_transition_day_bucket",
  "suspended_after_grace",
  "capacity_current_changed",
  "capacity_schedule_changed",
  "over_capacity_detected",
  "over_capacity_cleared",
  "period_peak_updated",
  "manual_reconcile",
  "payment_recovered",
  "paddle_webhook_duplicate_skipped",
  "paddle_webhook_orphan",
  "paddle_webhook_applied",
  "paddle_webhook_ignored",
  "paddle_commercial_semantics_note",
  "commercial_subscription_linked",
  "commercial_lifecycle_updated",
  "paddle_commercial_reconcile_applied",
  "paddle_commercial_reconcile_skipped",
  "paddle_commercial_reconcile_failed",
  "paddle_commercial_reconcile_license_conflict",
  "paddle_commercial_reconcile_divergence_noted",
  "manual_license_reconcile",
  "payment_receipt_emitted",
  "payment_receipt_skipped",
  "payment_receipt_duplicate_blocked",
  "payment_receipt_email_failed",
  "payment_receipt_pdf_regenerated",
  "payment_receipt_orphan_transaction",
] as const

export type BillingAuditEventType = (typeof BILLING_AUDIT_EVENT_TYPES)[number]

/**
 * Snapshot materializado (**entitlement operativo interno**).
 * Separado conceptualmente del estado Paddle “raw”; se actualiza por webhooks / jobs / proceso manual enterprise.
 */
export type WorkspaceBillingSnapshotProps = {
  workspacePublicId: string
  billingSource: BillingSource
  subscriptionExternalId: string | null
  /** Plan/catálogo lógico (v1 puede ser `'default'` hasta catálogo completo). */
  planKey: string
  /** Asientos dentro del baseline del plan. */
  includedSeats: number
  /** Contratados hoy dentro del modelo “adicionales” (capa producto cliente). */
  additionalPaidSeats: number
  /**
   * Derechos usables **hoy** (**antiabuso**: nunca aumenta sólo porque exista programa futuro).
   * Debe igualar típicamente `includedSeats + additionalPaidSeats ± ajustes internos**.
   */
  currentEntitledSeats: number
  /** Capacidad futura desde reducción interna (`workspace-licenses.pendingSeatReduction`). */
  scheduledEntitledSeats: number | null
  scheduledSeatChangeEffectiveAt: Date | null
  /**
   * Programación solo Paddle (ej. upgrade siguiente ciclo) — **no** aumenta entitlement actual ni licencia hasta hito.
   */
  paddleScheduledEntitledSeats: number | null
  paddleScheduledSeatChangeEffectiveAt: Date | null
  billingStatus: WorkspaceBillingStatus
  /** Inicio efectivo de ventana desde fallo recurrente reconocido. */
  gracePeriodStartsAt: Date | null
  gracePeriodEndsAt: Date | null
  suspensionEffectiveAt: Date | null
  peakUsageInBillingPeriod: number
  maxConcurrentActiveUsers: number
  billingCycleAnchor: Date | null
  currentPeriodStartsAt: Date | null
  currentPeriodEndsAt: Date | null
  lastCommercialSyncAt: Date | null
  commercialExternalSnapshot: string | null
  updatedAt: Date
  createdAt: Date
}

export type BillingGuardsComputed = {
  /** Uso trabajo principal (~producto Scrum/Kanban) — durante gracia = true (**v1**). */
  canUsePrimaryWorkspaceProductFeatures: boolean
  /** Siempre true en v1 (portal/factura mínimo / regularización por URL producto cuando exista UI). */
  canAccessBillingAndRegularizationRoutes: boolean
  canInviteSeatConsumingMembers: boolean
  canActivateOrReactivateSeatConsumingMembers: boolean
  /** Si no null, causa que bloquea expansión cuando aplique política estándar. */
  expansionBlockedReason: BillingExpansionBlockReason | null
}

export const BILLING_EXPANSION_BLOCK_REASONS = [
  /** Más usuarios efectivos (`active`+asiento) que `currentEntitledSeats`. */
  "over_capacity_regularization",
  /** Renovación recurrente suspendida después de gracia (**v1**). */
  "suspended_non_payment",
  /** No entitlements numéricamente disponibles pero sin sobrecapacidad (al límite exacto puede seguir igual política invites). */
  "seat_capacity_exhausted",
] as const

export type BillingExpansionBlockReason =
  (typeof BILLING_EXPANSION_BLOCK_REASONS)[number] | "unknown"
