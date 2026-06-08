import type { deriveExpansionGuards } from "./billing-guards.policy.js"
import type { WorkspaceBillingSnapshotProps } from "./workspace-billing-snapshot.js"
import type { BillingSource } from "./workspace-billing-status.js"

/** Estado público materializado para API workspace billing (`GET …/billing/state`). */
export type WorkspaceBillingPublicState = {
  workspacePublicId: string
  billingSource: BillingSource
  billingStatus: WorkspaceBillingSnapshotProps["billingStatus"]
  commercialExternalSnapshot: string | null
  planKey: string
  seats: {
    includedInPlan: number
    additionalPaid: number
    currentEntitled: number
    scheduledEntitledFuture: number | null
    scheduledSeatChangeEffectiveAt: string | null
  }
  usage: {
    activeAssignedUsers: number
    availableSeats: number
    overCapacity: boolean
    internalPeakUsageInBillingPeriod: number
    internalMaxConcurrentActiveUsersRecorded: number
  }
  grace: {
    isInGraceWindow: boolean
    gracePeriodStartsAt: string | null
    gracePeriodEndsAt: string | null
    messagingGraceDay: number | null
    /** Día 0–7 vs 8–14 dentro de gracia; `null` fuera de ventana o sin banda. */
    messagingBand: "early" | "late" | null
  }
  guards: ReturnType<typeof deriveExpansionGuards>
  timestamps: {
    lastCommercialSyncAt: string | null
    billingCycleAnchor: string | null
    currentPeriodStartsAt: string | null
    currentPeriodEndsAt: string | null
  }
}
