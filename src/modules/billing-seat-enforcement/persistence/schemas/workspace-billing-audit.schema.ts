import type { BillingAuditEventType } from "../../domain/workspace-billing-snapshot.js"

export interface WorkspaceBillingAuditDocProps {
  workspacePublicId: string
  eventType: BillingAuditEventType | string
  payload: Record<string, unknown>
  createdAt?: Date
}
