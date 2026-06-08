import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { ImpedimentAuditRepository } from "./persistence/impediment-audit.repository.js"
import type { ProjectImpedimentCommentsRepository } from "./persistence/impediment-comments.repository.js"
import type { ImpedimentRepository } from "./persistence/impediment.repository.js"
import { createProjectImpedimentsRouter } from "./routes/impediment.routes.js"
import { ProjectImpedimentCommentsService } from "./services/impediment-comments.service.js"
import { ImpedimentService } from "./services/impediment.service.js"

export type CreateImpedimentServiceOptions = {
  impedimentRepository: ImpedimentRepository
  auditRepository: ImpedimentAuditRepository
}

export function createImpedimentService(
  projectRuntimeService: ProjectRuntimeService,
  scrumBacklogRepository: ScrumBacklogRepository,
  sprintPlanningRepository: ScrumSprintPlanningRepository,
  workspaceUserService: WorkspaceUserService,
  options: CreateImpedimentServiceOptions,
): ImpedimentService {
  return new ImpedimentService(
    options.impedimentRepository,
    options.auditRepository,
    projectRuntimeService,
    scrumBacklogRepository,
    sprintPlanningRepository,
    workspaceUserService,
  )
}

export type CreateProjectImpedimentCommentsServiceOptions = {
  commentsRepository: ProjectImpedimentCommentsRepository
  impedimentRepository: ImpedimentRepository
}

export function createProjectImpedimentCommentsService(
  projectRuntimeService: ProjectRuntimeService,
  options: CreateProjectImpedimentCommentsServiceOptions,
): ProjectImpedimentCommentsService {
  return new ProjectImpedimentCommentsService(
    options.commentsRepository,
    options.impedimentRepository,
    projectRuntimeService,
  )
}

export type MountProjectImpedimentsModuleOptions = {
  impedimentService: ImpedimentService
  impedimentCommentsService: ProjectImpedimentCommentsService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Rutas bajo
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/impediments`.
 */
export function mountProjectImpedimentsModule(
  app: Express,
  options: MountProjectImpedimentsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/impediments",
    createProjectImpedimentsRouter(
      options.impedimentService,
      options.impedimentCommentsService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}

export { ImpedimentService } from "./services/impediment.service.js"
export { ProjectImpedimentCommentsService } from "./services/impediment-comments.service.js"
