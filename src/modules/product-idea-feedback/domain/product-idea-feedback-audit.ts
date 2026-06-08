export type ProductIdeaFeedbackAuditEventKind = "feedback_created" | "admin_review_updated"

export type ProductIdeaFeedbackAuditEvent = {
  eventPublicId: string
  feedbackPublicId: string
  workspacePublicId: string
  kind: ProductIdeaFeedbackAuditEventKind
  /** Usuario workspace (creación) o null si solo plataforma. */
  actorUserPublicId: string | null
  /** Usuario plataforma (cambios admin) o null en creación desde web. */
  actorPlatformUserId: string | null
  summary: string
  payloadBefore: unknown | null
  payloadAfter: unknown | null
  occurredAt: Date
}
