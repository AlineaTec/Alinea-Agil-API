import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumCarryoverDerivationService } from "../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import { ProjectAssignableUsersService } from "../work-item-assignment/services/project-assignable-users.service.js"
import { WorkItemAssignmentService } from "../work-item-assignment/services/work-item-assignment.service.js"
import type { WorkItemCommentsService } from "../work-item-comments/services/work-item-comments.service.js"
import type { WorkItemTimeEntriesService } from "../work-item-time-logging/services/work-item-time-entries.service.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkReadyDoneControlsService } from "../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkActivityNotificationFanoutService } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import type { WorkTeamMembershipRepository } from "../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamRepository } from "../workspace-work-teams/persistence/work-team.repository.js"
import type { ScrumBacklogRepository } from "./persistence/scrum-backlog.repository.js"
import { createProjectScrumBacklogRouter } from "./routes/project-scrum-backlog.routes.js"
import { ScrumBacklogService } from "./services/scrum-backlog.service.js"

export function createScrumBacklogService(
  projectRuntimeService: ProjectRuntimeService,
  sprintPlanningRepository: ScrumSprintPlanningRepository,
  repository: ScrumBacklogRepository,
  auditLogRepository?: WorkspaceAuditLogRepository | null,
  workControls?: WorkReadyDoneControlsService | null,
  workActivityNotifications?: WorkActivityNotificationFanoutService | null,
): ScrumBacklogService {
  return new ScrumBacklogService(
    repository,
    projectRuntimeService,
    sprintPlanningRepository,
    auditLogRepository ?? null,
    workControls ?? null,
    workActivityNotifications ?? null,
  )
}

export type ProjectAssignableUsersDeps = {
  projectRuntime: ProjectRuntimeRepository
  projectLinks: WorkTeamProjectLinkRepository
  teams: WorkTeamRepository
  memberships: WorkTeamMembershipRepository
}

export function createProjectAssignableUsersService(
  deps: ProjectAssignableUsersDeps,
  workspaceUserService: WorkspaceUserService,
): ProjectAssignableUsersService {
  return new ProjectAssignableUsersService(
    deps.projectRuntime,
    requireInjected(deps.projectLinks, "projectLinks"),
    requireInjected(deps.teams, "teams"),
    requireInjected(deps.memberships, "memberships"),
    workspaceUserService,
  )
}

export function createWorkItemAssignmentService(
  backlogRepository: ScrumBacklogRepository,
  projectRuntimeService: ProjectRuntimeService,
  workspaceUserService: WorkspaceUserService,
  projectAssignables: ProjectAssignableUsersService,
  auditLogRepository: WorkspaceAuditLogRepository | null = null,
  workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
): WorkItemAssignmentService {
  return new WorkItemAssignmentService(
    backlogRepository,
    projectRuntimeService,
    workspaceUserService,
    projectAssignables,
    auditLogRepository,
    workActivityNotifications,
  )
}

export { ScrumBacklogService } from "./services/scrum-backlog.service.js"
export type { ScrumBacklogItemState } from "./domain/scrum-backlog-item.js"
export { WorkItemAssignmentService } from "../work-item-assignment/services/work-item-assignment.service.js"
export { ProjectAssignableUsersService } from "../work-item-assignment/services/project-assignable-users.service.js"

export type MountProjectScrumBacklogModuleOptions = {
  scrumBacklogService: ScrumBacklogService
  workItemAssignmentService: WorkItemAssignmentService
  workItemCommentsService: WorkItemCommentsService
  workItemTimeEntriesService: WorkItemTimeEntriesService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  carryoverDerivationService: ScrumCarryoverDerivationService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectScrumBacklogModule(
  app: Express,
  options: MountProjectScrumBacklogModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-backlog",
    createProjectScrumBacklogRouter(
      options.scrumBacklogService,
      options.workItemAssignmentService,
      options.workItemCommentsService,
      options.workItemTimeEntriesService,
      options.authBearerService,
      options.workspaceUserService,
      options.carryoverDerivationService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
