import type { Express, RequestHandler } from "express"
import { createWorkspaceRepositories } from "../../infrastructure/persistence/workspace-repositories.factory.js"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberRepository } from "../workspace-users/persistence/workspace-member.repository.js"
import type { WorkTeamMembershipRepository } from "../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkItemTimeEntriesRepository } from "../work-item-time-logging/persistence/work-item-time-entries.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { DailyAlignmentParticipantUpdateRepository } from "./persistence/daily-alignment-participant-update.repository.js"
import type { DailyAlignmentSessionRepository } from "./persistence/daily-alignment-session.repository.js"
import { createDailyAlignmentRouter } from "./routes/daily-alignment.routes.js"
import { DailyAlignmentService } from "./services/daily-alignment.service.js"

export type CreateDailyAlignmentServiceDeps = {
  dailySessionRepository: DailyAlignmentSessionRepository
  dailyParticipantUpdateRepository: DailyAlignmentParticipantUpdateRepository
  workTeamProjectLinkRepository?: WorkTeamProjectLinkRepository
  workTeamMembershipRepository?: WorkTeamMembershipRepository
  workspaceMemberRepository?: WorkspaceMemberRepository
}

export function createDailyAlignmentService(
  projectRuntime: ProjectRuntimeService,
  sprintPlanningRepository: ScrumSprintPlanningRepository,
  timeEntriesRepository: WorkItemTimeEntriesRepository,
  auditLogRepository: WorkspaceAuditLogRepository,
  deps: CreateDailyAlignmentServiceDeps,
): DailyAlignmentService {
  const workspaceRepos = createWorkspaceRepositories()
  return new DailyAlignmentService(
    projectRuntime,
    sprintPlanningRepository,
    deps.dailySessionRepository,
    deps.dailyParticipantUpdateRepository,
    timeEntriesRepository,
    auditLogRepository,
    deps.workTeamProjectLinkRepository ?? workspaceRepos.workTeamProjectLink,
    deps.workTeamMembershipRepository ?? workspaceRepos.workTeamMembership,
    deps.workspaceMemberRepository ?? workspaceRepos.member,
  )
}

export { DailyAlignmentService } from "./services/daily-alignment.service.js"

export type MountDailyAlignmentModuleOptions = {
  dailyAlignmentService: DailyAlignmentService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Rutas bajo
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/daily-alignment`.
 */
export function mountDailyAlignmentModule(app: Express, options: MountDailyAlignmentModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/daily-alignment",
    createDailyAlignmentRouter(
      options.dailyAlignmentService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
