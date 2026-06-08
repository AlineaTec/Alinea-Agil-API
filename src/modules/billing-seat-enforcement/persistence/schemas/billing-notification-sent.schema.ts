import { BILLING_NOTIFICATION_KINDS } from "../../domain/billing-notification-kind.js"

export interface BillingNotificationSentDocProps {
  workspacePublicId: string
  kind: (typeof BILLING_NOTIFICATION_KINDS)[number]
  /** Clave estable por ciclo (p.ej. ISO fin de gracia) para idempotencia. */
  dedupeKey: string
  sentAt: Date
}
