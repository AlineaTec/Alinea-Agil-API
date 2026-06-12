import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkReadyDoneControlsService } from "../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkActivityNotificationFanoutService } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import type { ScrumCarryoverDerivationService } from "../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import { createProjectScrumSprintBoardRouter } from "./routes/project-scrum-sprint-board.routes.js"
import { SprintBoardService } from "./services/sprint-board.service.js"

export type CreateSprintBoardServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
  backlogRepo: ScrumBacklogRepository
  carryoverDerivation: ScrumCarryoverDerivationService
}

export function createSprintBoardService(
  projectRuntimeService: ProjectRuntimeService,
  workReadyDoneControlsService: WorkReadyDoneControlsService,
  auditLogRepository: WorkspaceAuditLogRepository | null = null,
  workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  options: CreateSprintBoardServiceOptions,
): SprintBoardService {
  return new SprintBoardService(
    options.sprintRepo,
    options.backlogRepo,
    projectRuntimeService,
    options.carryoverDerivation,
    workReadyDoneControlsService,
    auditLogRepository,
    workActivityNotifications,
  )
}

export { SprintBoardService } from "./services/sprint-board.service.js"

export type MountProjectScrumSprintBoardModuleOptions = {
  sprintBoardService: SprintBoardService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Rutas bajo
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`
 * (se combinan con las de sprint planning mediante un segundo `app.use` en el mismo prefijo).
 */
export function mountProjectScrumSprintBoardModule(
  app: Express,
  options: MountProjectScrumSprintBoardModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createProjectScrumSprintBoardRouter(
      options.sprintBoardService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
