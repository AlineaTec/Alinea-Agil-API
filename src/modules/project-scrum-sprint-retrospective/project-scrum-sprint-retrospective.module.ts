import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectScrumSprintRetrospectiveRouter } from "./routes/project-scrum-sprint-retrospective.routes.js"
import { SprintRetrospectiveService } from "./services/sprint-retrospective.service.js"

export type CreateSprintRetrospectiveServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
}

export function createSprintRetrospectiveService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateSprintRetrospectiveServiceOptions,
): SprintRetrospectiveService {
  return new SprintRetrospectiveService(options.sprintRepo, projectRuntimeService)
}

export { SprintRetrospectiveService } from "./services/sprint-retrospective.service.js"
export { sprintRetrospectiveStateToJson } from "./services/sprint-retrospective.service.js"

export type MountProjectScrumSprintRetrospectiveModuleOptions = {
  sprintRetrospectiveService: SprintRetrospectiveService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectScrumSprintRetrospectiveModule(
  app: Express,
  options: MountProjectScrumSprintRetrospectiveModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createProjectScrumSprintRetrospectiveRouter(
      options.sprintRetrospectiveService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
