import type { ProductIdeaFeedbackAuditEvent } from "../domain/product-idea-feedback-audit.js"

export type ProductIdeaFeedbackEntryAuditAppendInput = Omit<ProductIdeaFeedbackAuditEvent, "eventPublicId" | "occurredAt"> & {
  eventPublicId?: string
  occurredAt?: Date
}

export interface ProductIdeaFeedbackEntryAuditRepository {
  append(event: ProductIdeaFeedbackEntryAuditAppendInput): Promise<void>
}
