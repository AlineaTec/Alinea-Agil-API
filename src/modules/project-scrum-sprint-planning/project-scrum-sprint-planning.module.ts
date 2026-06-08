import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { ScrumCarryoverDerivationService } from "../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "./persistence/scrum-sprint-planning.repository.js"
import { createProjectScrumSprintPlanningRouter } from "./routes/project-scrum-sprint-planning.routes.js"
import { SprintPlanningService } from "./services/sprint-planning.service.js"
import type { WorkReadyDoneControlsService } from "../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkActivityNotificationFanoutService } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"

export type CreateSprintPlanningServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
  backlogRepo: ScrumBacklogRepository
  workControls?: WorkReadyDoneControlsService | null
  workActivityNotifications?: WorkActivityNotificationFanoutService | null
}

export function createSprintPlanningService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateSprintPlanningServiceOptions,
): SprintPlanningService {
  return new SprintPlanningService(
    requireInjected(options.sprintRepo, "sprintRepo"),
    requireInjected(options.backlogRepo, "backlogRepo"),
    projectRuntimeService,
    options.workControls ?? null,
    options.workActivityNotifications ?? null,
  )
}

export { SprintPlanningService } from "./services/sprint-planning.service.js"

export type MountProjectScrumSprintPlanningModuleOptions = {
  sprintPlanningService: SprintPlanningService
  carryoverDerivationService: ScrumCarryoverDerivationService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectScrumSprintPlanningModule(
  app: Express,
  options: MountProjectScrumSprintPlanningModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints",
    createProjectScrumSprintPlanningRouter(
      options.sprintPlanningService,
      options.carryoverDerivationService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
