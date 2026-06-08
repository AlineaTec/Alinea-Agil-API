import type { SprintClosureState } from "./sprint-closure.js"
import type { SprintRetrospectiveState } from "./sprint-retrospective.js"
import type { SprintReviewState } from "./sprint-review.js"
import type { ScrumSprintStatus } from "./sprint-status.js"

export type ScrumSprintState = {
  sprintPublicId: string
  workspacePublicId: string
  projectPublicId: string
  name: string
  goal: string
  status: ScrumSprintStatus
  startDate: Date | null
  endDate: Date | null
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  /** Presente solo cuando `status === "closed"`; `null` en sprints no cerrados. */
  closure: SprintClosureState | null
  /**
   * Sprint Review (artefacto cualitativo). Opcional; `null` si aún no se registró.
   * No forma parte del snapshot inmutable `closure`.
   */
  review: SprintReviewState | null
  /**
   * Sprint Retrospective (mejora de proceso/equipo). Opcional; `null` si aún no se registró.
   * No forma parte del snapshot inmutable `closure`.
   */
  retrospective: SprintRetrospectiveState | null
}
