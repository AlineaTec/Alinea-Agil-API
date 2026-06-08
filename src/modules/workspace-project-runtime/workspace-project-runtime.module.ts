import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ProjectDraftService } from "../workspace-projects/services/project-draft.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { ProjectRuntimeRepository } from "./persistence/project-runtime.repository.js"
import type { WorkTeamMembershipRepository } from "../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../workspace-work-teams/persistence/work-team-project-link.repository.js"
import { createWorkspaceProjectRuntimeRouter } from "./routes/workspace-project-runtime.routes.js"
import { ProjectRuntimeService } from "./services/project-runtime.service.js"

export type CreateProjectRuntimeServiceWorkspaceDeps = {
  workTeamMembership: WorkTeamMembershipRepository
  workTeamProjectLink: WorkTeamProjectLinkRepository
}

export function createProjectRuntimeService(
  projectRuntimeRepository: ProjectRuntimeRepository,
  workspace: CreateProjectRuntimeServiceWorkspaceDeps,
): ProjectRuntimeService {
  return new ProjectRuntimeService(
    projectRuntimeRepository,
    workspace.workTeamMembership,
    workspace.workTeamProjectLink,
  )
}

export { ProjectRuntimeService } from "./services/project-runtime.service.js"
export { DeveloperHoursReportService } from "./services/developer-hours-report.service.js"
export { AlignmentSessionsReportService } from "./services/alignment-sessions-report.service.js"
export { GuidedRefinementSessionsReportService } from "./services/guided-refinement-sessions-report.service.js"
export { GuidedReviewSessionsReportService } from "./services/guided-review-sessions-report.service.js"
export { GuidedRetrospectiveSessionsReportService } from "./services/guided-retrospective-sessions-report.service.js"
export { GuidedSprintPlanningSessionsReportService } from "./services/guided-sprint-planning-sessions-report.service.js"
export type { WorkspaceRuntimeProjectState } from "./domain/workspace-runtime-project.js"
export type { WorkspaceRuntimeProjectListItemDto, ProjectRuntimeSummaryDto } from "./services/project-runtime.service.js"

export type MountWorkspaceProjectRuntimeModuleOptions = {
  projectRuntimeService: ProjectRuntimeService
  projectDraftService: ProjectDraftService
  developerHoursReportService: import("./services/developer-hours-report.service.js").DeveloperHoursReportService
  alignmentSessionsReportService: import("./services/alignment-sessions-report.service.js").AlignmentSessionsReportService
  guidedRefinementSessionsReportService: import("./services/guided-refinement-sessions-report.service.js").GuidedRefinementSessionsReportService
  guidedReviewSessionsReportService: import("./services/guided-review-sessions-report.service.js").GuidedReviewSessionsReportService
  guidedRetrospectiveSessionsReportService: import("./services/guided-retrospective-sessions-report.service.js").GuidedRetrospectiveSessionsReportService
  guidedSprintPlanningSessionsReportService: import("./services/guided-sprint-planning-sessions-report.service.js").GuidedSprintPlanningSessionsReportService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Monta `GET /v1/workspaces/:workspacePublicId/projects` (listado),
 * `GET .../projects/:projectPublicId/summary`,
 * `GET .../projects/:projectPublicId/developer-hours-report`,
 * `GET .../projects/:projectPublicId/alignment-sessions-report` y
 * `GET .../projects/:projectPublicId/guided-refinement-sessions-report` y
 * `GET .../projects/:projectPublicId/guided-review-sessions-report` y
 * `GET .../projects/:projectPublicId/guided-retrospective-sessions-report` y
 * `GET .../projects/:projectPublicId/guided-sprint-planning-sessions-report`.
 * Los drafts del wizard siguen en `/v1/workspaces/:workspacePublicId/projects/drafts` (`workspace-projects`).
 */
export function mountWorkspaceProjectRuntimeModule(
  app: Express,
  options: MountWorkspaceProjectRuntimeModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects",
    createWorkspaceProjectRuntimeRouter(
      options.projectRuntimeService,
      options.projectDraftService,
      options.developerHoursReportService,
      options.alignmentSessionsReportService,
      options.guidedRefinementSessionsReportService,
      options.guidedReviewSessionsReportService,
      options.guidedRetrospectiveSessionsReportService,
      options.guidedSprintPlanningSessionsReportService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
