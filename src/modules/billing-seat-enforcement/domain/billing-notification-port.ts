/**
 * Hooks opcionales tras transiciones de billing materializadas (email / futura cola in-app).
 * La API HTTP no depende de estos hooks.
 */
export type BillingRecoveryContext = {
  priorGracePeriodEndsAt: Date | null
  wasSuspended: boolean
}

export interface BillingNotificationPort {
  onGraceStarted(workspacePublicId: string, gracePeriodEndsAt: Date): Promise<void>
  onSuspendedNonPayment(workspacePublicId: string): Promise<void>
  onPaymentRecovered(workspacePublicId: string, ctx: BillingRecoveryContext): Promise<void>
}
