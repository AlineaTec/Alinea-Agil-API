export type GuidedRetrospectiveActionItemStatus =
  | "pending"
  | "analyzing"
  | "executing"
  | "reviewing"
  | "finished"
  | "dropped"

export type GuidedRetrospectiveActionItemPriority = "low" | "medium" | "high"

/** Entradas de historial (notas del equipo y registro de cambios). */
export type GuidedRetrospectiveActionHistoryKind =
  | "note"
  | "status_changed"
  | "owner_changed"
  | "due_changed"
  | "priority_changed"
  | "description_changed"
  | "title_changed"
  /** Solo documentos antiguos; ya no se genera. */
  | "visibility_changed"

export type GuidedRetrospectiveActionItemHistoryEntry = {
  historyEntryPublicId: string
  actorUserPublicId: string
  occurredAt: Date
  kind: GuidedRetrospectiveActionHistoryKind
  message: string
}

export type GuidedRetrospectiveActionItemState = {
  actionItemPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  title: string
  description: string | null
  ownerUserPublicId: string | null
  dueDate: string | null
  /** Prioridad para ordenar foco (cierre v1). */
  priority: GuidedRetrospectiveActionItemPriority
  sourceContributionIds: string[]
  sourceTopicPublicIds: string[]
  status: GuidedRetrospectiveActionItemStatus
  /** Historial: notas explícitas y cambios relevantes. */
  history: GuidedRetrospectiveActionItemHistoryEntry[]
  createdAt: Date
  updatedAt: Date
}
