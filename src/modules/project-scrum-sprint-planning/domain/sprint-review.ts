/**
 * Sprint Review: subdocumento hermano de `closure` en el documento del sprint.
 * Definido en planning porque forma parte del agregado persistido `ScrumSprint`.
 *
 * Contrato alineado a contracts-docs `project-scrum-sprint-review` (no vive dentro del snapshot `closure`).
 */
export type SprintReviewState = {
  reviewPublicId: string
  sprintPublicId: string
  projectPublicId: string
  workspacePublicId: string
  summary: string
  incrementReviewNotes: string
  decisions: string
  nextSteps: string
  createdByUserPublicId: string
  updatedByUserPublicId: string
  createdAt: Date
  updatedAt: Date
}
