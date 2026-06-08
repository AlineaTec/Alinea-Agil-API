import type { MethodologyAssessment } from "./project-draft-assessment.js"
import type { ProjectDraftCharter } from "./project-draft-charter.js"
import type { MaterializationMeta } from "./project-draft-materialization.js"
import type { RecommendationResult } from "./project-draft-recommendation.js"
import type { ProjectDraftStatus } from "./project-draft-status.js"
import type { TraceEvent } from "./project-draft-trace.js"
import type { ManagementApproach } from "./management-approach.js"

/** Agregado principal del wizard de creación guiada (una entidad, secciones internas). */
export type ProjectDraftState = {
  draftPublicId: string
  workspacePublicId: string
  createdByUserPublicId: string
  status: ProjectDraftStatus
  /** Denominación de trabajo; puede alinearse con `charter.name`. */
  projectName: string
  charter: ProjectDraftCharter
  methodologyAssessment: MethodologyAssessment
  recommendationResult: RecommendationResult | null
  selectedApproach: ManagementApproach | null
  wasRecommendationOverridden: boolean | null
  overrideJustification: string | null
  materializedProjectPublicId: string | null
  trace: TraceEvent[]
  materialization: MaterializationMeta
  createdAt: Date
  updatedAt: Date
}
