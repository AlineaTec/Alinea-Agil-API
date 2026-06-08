/** Eventos de notificación billing (dedupe + ledger plantillas). */
export const BILLING_NOTIFICATION_KINDS = [
  "billing_grace_started",
  "billing_suspension_approaching",
  "billing_suspended_non_payment",
  "billing_recovered",
] as const

export type BillingNotificationKind = (typeof BILLING_NOTIFICATION_KINDS)[number]
