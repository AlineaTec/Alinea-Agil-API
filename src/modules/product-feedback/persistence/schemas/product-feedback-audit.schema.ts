import type { ProductFeedbackAuditEventKind } from "../../domain/product-feedback-audit.js"

export interface ProductFeedbackAuditDocProps {
  eventPublicId: string
  submissionPublicId: string
  workspacePublicId: string
  kind: ProductFeedbackAuditEventKind
  actorUserPublicId: string | null
  actorPlatformUserId: string | null
  summary: string
  payloadBefore: unknown | null
  payloadAfter: unknown | null
  occurredAt: Date
}
