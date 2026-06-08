import type { GuidedRefinementReviewedItemState } from "../../domain/guided-refinement-reviewed-item.js"

export interface GuidedRefinementReviewedItemDocProps {
  reviewedItemPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  workItemPublicId: string
  reviewStatus: GuidedRefinementReviewedItemState["reviewStatus"]
  readyForPlanning: boolean
  readyWithObservations: boolean
  observations: string | null
  businessClarifications: string | null
  technicalQuestions: string | null
  dependenciesText: string | null
  risksText: string | null
  estimationStatus: GuidedRefinementReviewedItemState["estimationStatus"]
  sizeConcern: GuidedRefinementReviewedItemState["sizeConcern"]
  notReadyReasons: string[]
  followUpRequired: boolean
  reviewedByUserPublicIds: string[]
  createdAt: Date
  updatedAt: Date
}
