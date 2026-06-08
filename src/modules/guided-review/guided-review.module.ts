import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { GuidedReviewDemonstratedItemRepository } from "./persistence/guided-review-demonstrated-item.repository.js"
import type { GuidedReviewFeedbackRepository } from "./persistence/guided-review-feedback.repository.js"
import type { GuidedReviewSessionRepository } from "./persistence/guided-review-session.repository.js"
import { createGuidedReviewRouter } from "./routes/guided-review.routes.js"
import { GuidedReviewService } from "./services/guided-review.service.js"

export type CreateGuidedReviewServiceDeps = {
  reviewSessionRepository: GuidedReviewSessionRepository
  reviewDemonstratedItemRepository: GuidedReviewDemonstratedItemRepository
  reviewFeedbackRepository: GuidedReviewFeedbackRepository
}

export function createGuidedReviewService(
  projectRuntime: ProjectRuntimeService,
  sprintPlanningRepository: ScrumSprintPlanningRepository,
  backlogRepository: ScrumBacklogRepository,
  auditLogRepository: WorkspaceAuditLogRepository,
  deps: CreateGuidedReviewServiceDeps,
): GuidedReviewService {
  return new GuidedReviewService(
    projectRuntime,
    sprintPlanningRepository,
    backlogRepository,
    deps.reviewSessionRepository,
    deps.reviewDemonstratedItemRepository,
    deps.reviewFeedbackRepository,
    auditLogRepository,
  )
}

export { GuidedReviewService } from "./services/guided-review.service.js"

export type MountGuidedReviewModuleOptions = {
  guidedReviewService: GuidedReviewService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountGuidedReviewModule(app: Express, options: MountGuidedReviewModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-review",
    createGuidedReviewRouter(
      options.guidedReviewService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
