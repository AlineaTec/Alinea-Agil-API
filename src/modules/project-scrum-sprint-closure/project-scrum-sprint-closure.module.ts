import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectScrumSprintClosureRouter } from "./routes/project-scrum-sprint-closure.routes.js"
import { SprintClosureService } from "./services/sprint-closure.service.js"

export type CreateSprintClosureServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
  backlogRepo: ScrumBacklogRepository
}

export function createSprintClosureService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateSprintClosureServiceOptions,
): SprintClosureService {
  return new SprintClosureService(options.sprintRepo, options.backlogRepo, projectRuntimeService)
}

export { SprintClosureService } from "./services/sprint-closure.service.js"

export type MountProjectScrumSprintClosureModuleOptions = {
  sprintClosureService: SprintClosureService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectScrumSprintClosureModule(
  app: Express,
  options: MountProjectScrumSprintClosureModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createProjectScrumSprintClosureRouter(
      options.sprintClosureService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
