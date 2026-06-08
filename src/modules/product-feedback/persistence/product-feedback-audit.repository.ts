import type { ProductFeedbackAuditEventKind } from "../domain/product-feedback-audit.js"

export type ProductFeedbackAuditAppendInput = {
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

export interface ProductFeedbackAuditRepository {
  append(input: ProductFeedbackAuditAppendInput): Promise<void>
}
