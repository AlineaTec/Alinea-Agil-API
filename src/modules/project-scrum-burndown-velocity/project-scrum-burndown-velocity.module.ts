import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { SprintMetricsService } from "../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import { ScrumBurndownVelocityService } from "./services/scrum-burndown-velocity.service.js"
import {
  createScrumProjectVelocityRouter,
  createScrumSprintBurndownRouter,
} from "./routes/project-scrum-burndown-velocity.routes.js"

export type CreateScrumBurndownVelocityServiceDeps = {
  projectRuntime: ProjectRuntimeService
  sprintRepo: ScrumSprintPlanningRepository
  backlogRepo: ScrumBacklogRepository
  auditRepo: WorkspaceAuditLogRepository
  sprintMetrics: SprintMetricsService
}

export function createScrumBurndownVelocityService(
  deps: CreateScrumBurndownVelocityServiceDeps,
): ScrumBurndownVelocityService {
  return new ScrumBurndownVelocityService(
    deps.sprintRepo,
    deps.backlogRepo,
    deps.auditRepo,
    deps.projectRuntime,
    deps.sprintMetrics,
  )
}

export { ScrumBurndownVelocityService } from "./services/scrum-burndown-velocity.service.js"

export type MountProjectScrumBurndownVelocityModuleOptions = {
  service: ScrumBurndownVelocityService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Monta burndown bajo el mismo prefijo que tablero/métricas de sprints, y velocity bajo `.../scrum-metrics`.
 */
export function mountProjectScrumBurndownVelocityModule(
  app: Express,
  options: MountProjectScrumBurndownVelocityModuleOptions,
): void {
  const { service, authBearerService, workspaceUserService, billingPrimaryProductMutationGate } = options
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createScrumSprintBurndownRouter(service, authBearerService, workspaceUserService, billingPrimaryProductMutationGate),
  )
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-metrics",
    createScrumProjectVelocityRouter(service, authBearerService, workspaceUserService, billingPrimaryProductMutationGate),
  )
}
