import type { ProductIdeaFeedbackAuditEventKind } from "../../domain/product-idea-feedback-audit.js"

export interface ProductIdeaFeedbackEntryAuditDocProps {
  eventPublicId: string
  feedbackPublicId: string
  workspacePublicId: string
  kind: ProductIdeaFeedbackAuditEventKind
  actorUserPublicId: string | null
  actorPlatformUserId: string | null
  summary: string
  payloadBefore: unknown | null
  payloadAfter: unknown | null
  occurredAt: Date
}
