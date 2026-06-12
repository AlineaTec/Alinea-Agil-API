import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumCarryoverDerivationService } from "../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import { createProjectRoadmapRouter } from "./routes/project-roadmap.routes.js"
import { RoadmapSummaryService } from "./services/roadmap-summary.service.js"

export function createRoadmapSummaryService(
  projectRuntimeService: ProjectRuntimeService,
  scrumBacklogRepository: ScrumBacklogRepository,
  scrumSprintPlanningRepository: ScrumSprintPlanningRepository,
  carryoverDerivationService: ScrumCarryoverDerivationService,
): RoadmapSummaryService {
  return new RoadmapSummaryService(
    projectRuntimeService,
    requireInjected(scrumBacklogRepository, "scrumBacklogRepository"),
    requireInjected(scrumSprintPlanningRepository, "scrumSprintPlanningRepository"),
    carryoverDerivationService,
  )
}

export type MountProjectRoadmapModuleOptions = {
  roadmapSummaryService: RoadmapSummaryService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectRoadmapModule(app: Express, options: MountProjectRoadmapModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/roadmap",
    createProjectRoadmapRouter(
      options.roadmapSummaryService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
