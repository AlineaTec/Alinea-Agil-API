import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import { SprintMetricsService } from "../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import { createTeamFlowDeliveryMetricsRouter } from "./routes/team-flow-delivery-metrics.routes.js"
import { TeamFlowDeliveryMetricsService } from "./services/team-flow-delivery-metrics.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkTeamProjectLinkRepository } from "../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamMembershipRepository } from "../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamRepository } from "../workspace-work-teams/persistence/work-team.repository.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"

export type CreateTeamFlowDeliveryMetricsServiceOptions = {
  teams: WorkTeamRepository
  memberships: WorkTeamMembershipRepository
  projectLinks: WorkTeamProjectLinkRepository
  backlog: ScrumBacklogRepository
  projectRuntime: ProjectRuntimeRepository
  sprintRepo: ScrumSprintPlanningRepository
  sprintMetrics?: SprintMetricsService
  now?: () => Date
}

export function createTeamFlowDeliveryMetricsService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateTeamFlowDeliveryMetricsServiceOptions,
): TeamFlowDeliveryMetricsService {
  const sprintRepo = requireInjected(options.sprintRepo, "sprintRepo")
  const sprintMetrics =
    options.sprintMetrics ?? new SprintMetricsService(sprintRepo, projectRuntimeService)
  return new TeamFlowDeliveryMetricsService(
    requireInjected(options.teams, "teams"),
    requireInjected(options.memberships, "memberships"),
    requireInjected(options.projectLinks, "projectLinks"),
    requireInjected(options.backlog, "backlog"),
    requireInjected(options.projectRuntime, "projectRuntime"),
    sprintRepo,
    sprintMetrics,
    options.now,
  )
}

export type MountTeamFlowDeliveryMetricsModuleOptions = {
  service: TeamFlowDeliveryMetricsService
  authBearerService: AuthBearerService
  workspaceUserService: import("../workspace-users/services/workspace-user.service.js").WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountTeamFlowDeliveryMetricsModule(
  app: Express,
  options: MountTeamFlowDeliveryMetricsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId",
    createTeamFlowDeliveryMetricsRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}

export { TeamFlowDeliveryMetricsService } from "./services/team-flow-delivery-metrics.service.js"
