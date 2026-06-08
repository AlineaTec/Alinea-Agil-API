export type GuidedRefinementReviewStatus = "not_started" | "in_review" | "reviewed"

export type GuidedRefinementEstimationStatus =
  | "not_applicable"
  | "pending"
  | "recorded"
  | "deferred"

export type GuidedRefinementSizeConcern = "none" | "large" | "split_recommended"

export type GuidedRefinementReviewedItemState = {
  reviewedItemPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  /** Copia del sessionDate contenedor para consultas de “última revisión”. */
  sessionDate: string
  workItemPublicId: string
  reviewStatus: GuidedRefinementReviewStatus
  readyForPlanning: boolean
  readyWithObservations: boolean
  observations: string | null
  businessClarifications: string | null
  technicalQuestions: string | null
  dependenciesText: string | null
  risksText: string | null
  estimationStatus: GuidedRefinementEstimationStatus
  sizeConcern: GuidedRefinementSizeConcern
  notReadyReasons: string[]
  followUpRequired: boolean
  reviewedByUserPublicIds: string[]
  createdAt: Date
  updatedAt: Date
}
