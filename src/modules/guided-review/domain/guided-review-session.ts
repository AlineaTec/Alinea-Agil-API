import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export const GUIDED_REVIEW_DEFAULT_SLOT = "default" as const

export type GuidedReviewSessionStatus = "open" | "closed" | "closed_without_decisions"

export type GuidedReviewMode = "live" | "async"

export type SprintGoalAssessment =
  | "achieved"
  | "partially_achieved"
  | "compromised"
  | "unclear"
  | "not_applicable"

export type GuidedReviewAdditiveNote = {
  noteText: string
  createdByUserPublicId: string
  createdAt: Date
}

/** Transcripción registrada tras el cierre (un solo bloque; se sustituye al guardar). */
export type GuidedReviewTranscriptAfterClose = {
  text: string
  updatedAt: Date
  updatedByUserPublicId: string
}

export type GuidedReviewSessionState = {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  operationalApproach: OperationalApproach
  operationalTimeZone: string
  reviewMode: GuidedReviewMode
  facilitatorUserPublicId: string | null
  productOwnerUserPublicId: string | null
  status: GuidedReviewSessionStatus
  /** Foco / objetivo de la sesión (antes y durante). */
  reviewGoalSummary: string | null
  /** Resumen general del facilitador al cerrar. */
  closeSummary: string | null
  agreements: string[]
  followUps: string[]
  stakeholderSummary: string | null
  openQuestionsRemaining: string[]
  /** Notas metodológicas opcionales al cierre. */
  methodologicalNotes: string | null
  /** Conclusión sobre el incremento mostrado (cualitativa). */
  incrementAssessment: string | null
  sprintGoalAssessment: SprintGoalAssessment | null
  /** Obligatorio si sprintGoalAssessment === partially_achieved (OQ-GREV-7). */
  sprintGoalAssessmentExplanation: string | null
  /** Transcripción única post-cierre (sustituible; ver notas aditivas aparte). */
  transcriptAfterClose: GuidedReviewTranscriptAfterClose | null
  additiveNotesAfterClose: GuidedReviewAdditiveNote[]
  demonstratedItemCount: number
  feedbackCount: number
  backlogImpactCount: number
  startedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
