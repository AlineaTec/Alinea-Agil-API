import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { SprintPlanningService } from "../project-scrum-sprint-planning/services/sprint-planning.service.js"
import type { GuidedRefinementReviewedItemRepository } from "../guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { GuidedSprintPlanningBaselineRepository } from "./persistence/guided-sprint-planning-baseline.repository.js"
import type { GuidedSprintPlanningCandidateItemRepository } from "./persistence/guided-sprint-planning-candidate-item.repository.js"
import type { GuidedSprintPlanningSessionRepository } from "./persistence/guided-sprint-planning-session.repository.js"
import { createGuidedSprintPlanningRouter } from "./routes/guided-sprint-planning.routes.js"
import { GuidedSprintPlanningService } from "./services/guided-sprint-planning.service.js"

export type CreateGuidedSprintPlanningServiceDeps = {
  projectRuntime: ProjectRuntimeService
  sprintPlanningRepository: ScrumSprintPlanningRepository
  backlogRepository: ScrumBacklogRepository
  sprintPlanningService: SprintPlanningService
  auditLogRepository: WorkspaceAuditLogRepository
  refinementReviewedItemRepository: GuidedRefinementReviewedItemRepository
  guidedPlanningSessionRepository: GuidedSprintPlanningSessionRepository
  guidedPlanningCandidateItemRepository: GuidedSprintPlanningCandidateItemRepository
  guidedPlanningBaselineRepository: GuidedSprintPlanningBaselineRepository
}

export function createGuidedSprintPlanningService(
  deps: CreateGuidedSprintPlanningServiceDeps,
): GuidedSprintPlanningService {
  return new GuidedSprintPlanningService(
    deps.projectRuntime,
    deps.sprintPlanningRepository,
    deps.backlogRepository,
    deps.sprintPlanningService,
    deps.refinementReviewedItemRepository,
    deps.guidedPlanningSessionRepository,
    deps.guidedPlanningCandidateItemRepository,
    deps.guidedPlanningBaselineRepository,
    deps.auditLogRepository,
  )
}

export { GuidedSprintPlanningService } from "./services/guided-sprint-planning.service.js"

export type MountGuidedSprintPlanningModuleOptions = {
  guidedSprintPlanningService: GuidedSprintPlanningService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountGuidedSprintPlanningModule(
  app: Express,
  options: MountGuidedSprintPlanningModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-sprint-planning",
    createGuidedSprintPlanningRouter(
      options.guidedSprintPlanningService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
