import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkActivityNotificationsPort } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import type { GuidedRetrospectiveActionItemRepository } from "./persistence/guided-retrospective-action-item.repository.js"
import type { GuidedRetrospectiveContributionRepository } from "./persistence/guided-retrospective-contribution.repository.js"
import type { GuidedRetrospectiveSessionRepository } from "./persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveTopicRepository } from "./persistence/guided-retrospective-topic.repository.js"
import type { GuidedRetrospectiveVoteRepository } from "./persistence/guided-retrospective-vote.repository.js"
import {
  createGuidedRetrospectiveJoinRouter,
  createGuidedRetrospectiveProjectRouter,
  createGuidedRetrospectivePublicJoinRouter,
} from "./routes/guided-retrospective.routes.js"
import { GuidedRetrospectiveService } from "./services/guided-retrospective.service.js"

export type CreateGuidedRetrospectiveServiceDeps = {
  retroSessionRepository: GuidedRetrospectiveSessionRepository
  retroTopicRepository: GuidedRetrospectiveTopicRepository
  retroContributionRepository: GuidedRetrospectiveContributionRepository
  retroVoteRepository: GuidedRetrospectiveVoteRepository
  retroActionItemRepository: GuidedRetrospectiveActionItemRepository
}

export function createGuidedRetrospectiveService(
  projectRuntime: ProjectRuntimeService,
  sprintPlanningRepository: ScrumSprintPlanningRepository,
  auditLogRepository: WorkspaceAuditLogRepository,
  workActivityNotifications: WorkActivityNotificationsPort | null,
  deps: CreateGuidedRetrospectiveServiceDeps,
): GuidedRetrospectiveService {
  return new GuidedRetrospectiveService(
    projectRuntime,
    sprintPlanningRepository,
    deps.retroSessionRepository,
    deps.retroTopicRepository,
    deps.retroContributionRepository,
    deps.retroVoteRepository,
    deps.retroActionItemRepository,
    auditLogRepository,
    workActivityNotifications,
  )
}

export { GuidedRetrospectiveService } from "./services/guided-retrospective.service.js"

export type MountGuidedRetrospectiveModuleOptions = {
  guidedRetrospectiveService: GuidedRetrospectiveService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountGuidedRetrospectiveModule(app: Express, options: MountGuidedRetrospectiveModuleOptions): void {
  const common = [
    options.guidedRetrospectiveService,
    options.authBearerService,
    options.workspaceUserService,
    options.billingPrimaryProductMutationGate,
  ] as const
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-retrospective",
    createGuidedRetrospectiveProjectRouter(...common),
  )
  app.use(
    "/v1/workspaces/:workspacePublicId/guided-retrospective",
    createGuidedRetrospectiveJoinRouter(...common),
  )
}

export type MountGuidedRetrospectivePublicModuleOptions = {
  guidedRetrospectiveService: GuidedRetrospectiveService
  joinResolveRateLimit: RequestHandler
}

export function mountGuidedRetrospectivePublicModule(app: Express, options: MountGuidedRetrospectivePublicModuleOptions): void {
  app.use(
    "/v1/public/guided-retrospective",
    createGuidedRetrospectivePublicJoinRouter(options.guidedRetrospectiveService, options.joinResolveRateLimit),
  )
}
