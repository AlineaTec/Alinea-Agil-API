import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "./persistence/guided-refinement-reviewed-item.repository.js"
import type { GuidedRefinementSessionRepository } from "./persistence/guided-refinement-session.repository.js"
import { createGuidedRefinementRouter } from "./routes/guided-refinement.routes.js"
import { GuidedRefinementService } from "./services/guided-refinement.service.js"

export type CreateGuidedRefinementServiceDeps = {
  refinementSessionRepository: GuidedRefinementSessionRepository
  refinementReviewedItemRepository: GuidedRefinementReviewedItemRepository
}

export function createGuidedRefinementService(
  projectRuntime: ProjectRuntimeService,
  sprintPlanningRepository: ScrumSprintPlanningRepository,
  backlogRepository: ScrumBacklogRepository,
  auditLogRepository: WorkspaceAuditLogRepository,
  deps: CreateGuidedRefinementServiceDeps,
): GuidedRefinementService {
  return new GuidedRefinementService(
    projectRuntime,
    sprintPlanningRepository,
    backlogRepository,
    deps.refinementSessionRepository,
    deps.refinementReviewedItemRepository,
    auditLogRepository,
  )
}

export { GuidedRefinementService } from "./services/guided-refinement.service.js"

export type MountGuidedRefinementModuleOptions = {
  guidedRefinementService: GuidedRefinementService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountGuidedRefinementModule(app: Express, options: MountGuidedRefinementModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-refinement",
    createGuidedRefinementRouter(
      options.guidedRefinementService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
