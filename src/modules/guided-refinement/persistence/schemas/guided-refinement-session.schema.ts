import { OPERATIONAL_APPROACHES } from "../../../workspace-project-runtime/domain/operational-approach.js"
import type { GuidedRefinementSessionState } from "../../domain/guided-refinement-session.js"

export interface GuidedRefinementSessionDocProps {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  operationalApproach: (typeof OPERATIONAL_APPROACHES)[number]
  operationalTimeZone: string
  refinementMode: "live" | "async"
  facilitatorUserPublicId: string | null
  productOwnerUserPublicId: string | null
  status: GuidedRefinementSessionState["status"]
  focusSummary: string | null
  candidateWorkItemPublicIds: string[]
  closeSummary: string | null
  agreements: string[]
  followUps: string[]
  openQuestions: string[]
  additiveNotesAfterClose: string[]
  reviewedItemCount: number
  readyForPlanningCount: number
  pendingCandidateReviewCount: number
  reviewedNotReadyCount: number
  startedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
