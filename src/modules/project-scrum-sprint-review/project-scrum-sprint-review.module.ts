import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectScrumSprintReviewRouter } from "./routes/project-scrum-sprint-review.routes.js"
import { SprintReviewService } from "./services/sprint-review.service.js"

export type CreateSprintReviewServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
}

export function createSprintReviewService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateSprintReviewServiceOptions,
): SprintReviewService {
  return new SprintReviewService(options.sprintRepo, projectRuntimeService)
}

export { SprintReviewService } from "./services/sprint-review.service.js"
export { sprintReviewStateToJson } from "./services/sprint-review.service.js"

export type MountProjectScrumSprintReviewModuleOptions = {
  sprintReviewService: SprintReviewService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectScrumSprintReviewModule(
  app: Express,
  options: MountProjectScrumSprintReviewModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createProjectScrumSprintReviewRouter(
      options.sprintReviewService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
