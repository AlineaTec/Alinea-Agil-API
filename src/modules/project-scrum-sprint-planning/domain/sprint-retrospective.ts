/**
 * Sprint Retrospective: subdocumento hermano de `closure` y `review` en el documento del sprint.
 * Centrado en mejora del proceso y del equipo (no inspección del incremento).
 *
 * Contrato alineado a contracts-docs `project-scrum-sprint-retrospective` (no vive dentro del snapshot `closure`).
 */
export const SPRINT_RETROSPECTIVE_ACTION_ITEM_STATUSES = ["open", "done"] as const
export type SprintRetrospectiveActionItemStatus =
  (typeof SPRINT_RETROSPECTIVE_ACTION_ITEM_STATUSES)[number]

export type SprintRetrospectiveActionItemState = {
  actionItemPublicId: string
  text: string
  ownerUserPublicId: string | null
  status: SprintRetrospectiveActionItemStatus
  createdAt: Date
  updatedAt: Date
}

export type SprintRetrospectiveState = {
  retrospectivePublicId: string
  sprintPublicId: string
  projectPublicId: string
  workspacePublicId: string
  wentWell: string
  didNotGoWell: string
  improvements: string
  actionItems: SprintRetrospectiveActionItemState[]
  createdByUserPublicId: string
  updatedByUserPublicId: string
  createdAt: Date
  updatedAt: Date
}
