import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import { SprintMetricsService } from "../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import { createTeamPredictabilityMetricsRouter } from "./routes/team-predictability-metrics.routes.js"
import { TeamPredictabilityMetricsService } from "./services/team-predictability-metrics.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkTeamProjectLinkRepository } from "../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamMembershipRepository } from "../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamRepository } from "../workspace-work-teams/persistence/work-team.repository.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { KanbanMetricsService } from "../project-kanban-metrics/services/kanban-metrics.service.js"

export type CreateTeamPredictabilityMetricsServiceOptions = {
  teams: WorkTeamRepository
  memberships: WorkTeamMembershipRepository
  projectLinks: WorkTeamProjectLinkRepository
  projectRuntime: ProjectRuntimeRepository
  sprintRepo: ScrumSprintPlanningRepository
  sprintMetrics?: SprintMetricsService
  kanbanMetrics: KanbanMetricsService
  now?: () => Date
}

export function createTeamPredictabilityMetricsService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateTeamPredictabilityMetricsServiceOptions,
): TeamPredictabilityMetricsService {
  const sprintRepo = requireInjected(options.sprintRepo, "sprintRepo")
  const sprintMetrics =
    options.sprintMetrics ?? new SprintMetricsService(sprintRepo, projectRuntimeService)
  return new TeamPredictabilityMetricsService(
    requireInjected(options.teams, "teams"),
    requireInjected(options.memberships, "memberships"),
    requireInjected(options.projectLinks, "projectLinks"),
    requireInjected(options.projectRuntime, "projectRuntime"),
    sprintRepo,
    sprintMetrics,
    options.kanbanMetrics,
    options.now,
  )
}

export type MountTeamPredictabilityMetricsModuleOptions = {
  service: TeamPredictabilityMetricsService
  authBearerService: AuthBearerService
  workspaceUserService: import("../workspace-users/services/workspace-user.service.js").WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountTeamPredictabilityMetricsModule(
  app: Express,
  options: MountTeamPredictabilityMetricsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId",
    createTeamPredictabilityMetricsRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}

export { TeamPredictabilityMetricsService } from "./services/team-predictability-metrics.service.js"
