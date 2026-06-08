import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createTeamOperationalMetricsRouter } from "./routes/team-operational-metrics.routes.js"
import { TeamOperationalMetricsService } from "./services/team-operational-metrics.service.js"

export type CreateTeamOperationalMetricsServiceOptions = {
  teams: import("../workspace-work-teams/persistence/work-team.repository.js").WorkTeamRepository
  memberships: import("../workspace-work-teams/persistence/work-team-membership.repository.js").WorkTeamMembershipRepository
  projectLinks: import("../workspace-work-teams/persistence/work-team-project-link.repository.js").WorkTeamProjectLinkRepository
  backlog: import("../project-scrum-backlog/persistence/scrum-backlog.repository.js").ScrumBacklogRepository
  impediments: import("../project-impediments/persistence/impediment.repository.js").ImpedimentRepository
  projectRuntime: import("../workspace-project-runtime/persistence/project-runtime.repository.js").ProjectRuntimeRepository
}

export function createTeamOperationalMetricsService(
  workspaceUserService: WorkspaceUserService,
  options: CreateTeamOperationalMetricsServiceOptions,
): TeamOperationalMetricsService {
  return new TeamOperationalMetricsService(
    requireInjected(options.teams, "teams"),
    requireInjected(options.memberships, "memberships"),
    requireInjected(options.projectLinks, "projectLinks"),
    requireInjected(options.backlog, "backlog"),
    requireInjected(options.impediments, "impediments"),
    requireInjected(options.projectRuntime, "projectRuntime"),
    workspaceUserService,
  )
}

export type MountTeamOperationalMetricsModuleOptions = {
  service: TeamOperationalMetricsService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountTeamOperationalMetricsModule(
  app: Express,
  options: MountTeamOperationalMetricsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId",
    createTeamOperationalMetricsRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}

export { TeamOperationalMetricsService } from "./services/team-operational-metrics.service.js"
