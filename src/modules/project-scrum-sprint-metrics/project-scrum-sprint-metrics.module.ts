import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectScrumSprintMetricsRouter } from "./routes/project-scrum-sprint-metrics.routes.js"
import { SprintMetricsService } from "./services/sprint-metrics.service.js"

export type CreateSprintMetricsServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
}

export function createSprintMetricsService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateSprintMetricsServiceOptions,
): SprintMetricsService {
  return new SprintMetricsService(options.sprintRepo, projectRuntimeService)
}

export { SprintMetricsService } from "./services/sprint-metrics.service.js"
export { basicSprintMetricsToJson } from "./services/sprint-metrics.service.js"

export type MountProjectScrumSprintMetricsModuleOptions = {
  sprintMetricsService: SprintMetricsService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectScrumSprintMetricsModule(
  app: Express,
  options: MountProjectScrumSprintMetricsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createProjectScrumSprintMetricsRouter(
      options.sprintMetricsService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
