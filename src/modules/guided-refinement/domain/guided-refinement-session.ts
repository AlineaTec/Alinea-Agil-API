import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export const GUIDED_REFINEMENT_DEFAULT_SLOT = "default" as const

export type GuidedRefinementSessionStatus = "open" | "closed" | "closed_without_decisions"

export type GuidedRefinementMode = "live" | "async"

export type GuidedRefinementSessionState = {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  operationalApproach: OperationalApproach
  operationalTimeZone: string
  refinementMode: GuidedRefinementMode
  facilitatorUserPublicId: string | null
  productOwnerUserPublicId: string | null
  status: GuidedRefinementSessionStatus
  focusSummary: string | null
  candidateWorkItemPublicIds: string[]
  /** Resumen del facilitador al cerrar (generalSummary contractual). */
  closeSummary: string | null
  agreements: string[]
  followUps: string[]
  openQuestions: string[]
  /** Notas aditivas tras cierre (OQ-GRF-3); no reabre la sesión. */
  additiveNotesAfterClose: string[]
  reviewedItemCount: number
  readyForPlanningCount: number
  /** Candidatos de sesión aún sin `reviewStatus === reviewed` (0 si no hay lista de candidatos). */
  pendingCandidateReviewCount: number
  /** Filas de revisión con `reviewStatus === reviewed` y `readyForPlanning === false`. */
  reviewedNotReadyCount: number
  startedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
