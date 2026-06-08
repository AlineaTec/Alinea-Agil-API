import { BILLING_SOURCES, WORKSPACE_BILLING_STATUSES } from "../../domain/workspace-billing-status.js"

/** Materialización entitlement / salud cobro (**no consulta Paddle en runtime request**). */

export interface WorkspaceBillingSnapshotDocProps {
  workspacePublicId: string
  billingSource: (typeof BILLING_SOURCES)[number]
  subscriptionExternalId: string | null
  planKey: string
  includedSeats: number
  additionalPaidSeats: number
  currentEntitledSeats: number
  scheduledEntitledSeats: number | null
  scheduledSeatChangeEffectiveAt: Date | null
  paddleScheduledEntitledSeats: number | null
  paddleScheduledSeatChangeEffectiveAt: Date | null
  billingStatus: (typeof WORKSPACE_BILLING_STATUSES)[number]
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
}
