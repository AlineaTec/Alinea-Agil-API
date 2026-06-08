import {
  CALENDAR_MS_PER_DAY_V1_GRACE,
  isWithinGraceWallClock,
  type ResolvedBillingOperationalView,
} from "./billing-period.policy.js"
import type { BillingExpansionBlockReason, BillingGuardsComputed } from "./workspace-billing-snapshot.js"
import type { WorkspaceBillingSnapshotProps } from "./workspace-billing-snapshot.js"

export function deriveGraceMessagingDay(reference: Date, graceStartsAt: Date | null): number | null {
  if (!graceStartsAt || reference < graceStartsAt) return null
  const dayIdx = Math.floor(
    (reference.getTime() - graceStartsAt.getTime()) / CALENDAR_MS_PER_DAY_V1_GRACE,
  )
  return Math.min(14, Math.max(0, dayIdx))
}

/**
 * **v1** — Durante cualquier período efectivo marcado dentro de timestamps gracia ⇒ trabajo completo (**banners lado web**) salvo errores graves estados terminados (**cancel/expir** ⇒ bloque trabajo).
 */
export function resolveOperationalView(
  row: WorkspaceBillingSnapshotProps,
  now: Date,
): ResolvedBillingOperationalView {
  if (row.billingStatus === "suspended_non_payment") {
    return {
      canUsePrimaryWorkspaceProductFeatures: false,
      messagingGraceDay: null,
      suspendedOperational: true,
    }
  }

  if (row.billingStatus === "cancelled" || row.billingStatus === "expired") {
    return {
      canUsePrimaryWorkspaceProductFeatures: false,
      messagingGraceDay: null,
      suspendedOperational: false,
    }
  }

  let graceMessaging: number | null = null

  /** Dentro marca ventanas gracia (estado `*_grace*|payment_action*` con timestamps). **/

  const inMarkedGraceDates =
    row.gracePeriodStartsAt &&
    row.gracePeriodEndsAt &&
    isWithinGraceWallClock(now, row.gracePeriodStartsAt, row.gracePeriodEndsAt)

  if (
    (row.billingStatus === "grace_period" || row.billingStatus === "payment_action_required") &&
    inMarkedGraceDates
  ) {
    graceMessaging = deriveGraceMessagingDay(now, row.gracePeriodStartsAt)
  }

  return {
    /** Gracia trabajo completo; activo también. **/
    canUsePrimaryWorkspaceProductFeatures: true,
    messagingGraceDay: graceMessaging,
    suspendedOperational: false,
  }
}

/** Programación futuros asientos ⇒ **no aumenta entitlement** sólo porque exista programa (antiabuso) — garantía validada en snapshots servicio. **/

export function deriveExpansionGuards(input: {
  snapshot: WorkspaceBillingSnapshotProps
  activeAssignedUsers: number
  currentEntitledSeats: number
  availableSeatsRaw: number
  operationalView: ResolvedBillingOperationalView
}): BillingGuardsComputed & { overCapacity: boolean } {
  const overCapacity =
    input.activeAssignedUsers > input.currentEntitledSeats

  if (input.snapshot.billingStatus === "suspended_non_payment") {
    return {
      canUsePrimaryWorkspaceProductFeatures:
        input.operationalView.canUsePrimaryWorkspaceProductFeatures,
      canAccessBillingAndRegularizationRoutes: true,
      canInviteSeatConsumingMembers: false,
      canActivateOrReactivateSeatConsumingMembers: false,
      expansionBlockedReason: "suspended_non_payment",
      overCapacity,
    }
  }

  const noFreeSeat = input.availableSeatsRaw < 1

  let reason: BillingExpansionBlockReason | null = null
  if (overCapacity) reason = "over_capacity_regularization"
  else if (noFreeSeat) reason = "seat_capacity_exhausted"

  const blockExpansionInvite = overCapacity || noFreeSeat

  return {
    canUsePrimaryWorkspaceProductFeatures:
      input.operationalView.canUsePrimaryWorkspaceProductFeatures,
    canAccessBillingAndRegularizationRoutes: true,
    canInviteSeatConsumingMembers: !blockExpansionInvite,
    canActivateOrReactivateSeatConsumingMembers: !blockExpansionInvite,
    expansionBlockedReason: reason,
    overCapacity,
  }
}

/** Franjas de mensajería durante gracia: día 0–7 vs 8–14 (documentación billing-seat-enforcement). */
export function deriveGraceMessagingBand(messagingGraceDay: number | null): "early" | "late" | null {
  if (messagingGraceDay === null) return null
  if (messagingGraceDay <= 7) return "early"
  return "late"
}
