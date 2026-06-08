import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ImpedimentRepository } from "../project-impediments/persistence/impediment.repository.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkControlOverrideTokenRepository } from "./persistence/work-control-override-token.repository.js"
import type { WorkControlsAuditRepository } from "./persistence/work-controls-audit.repository.js"
import type { WorkControlsProjectProfileRepository } from "./persistence/work-controls-project-profile.repository.js"
import type { WorkControlsWorkspaceTemplateRepository } from "./persistence/work-controls-workspace-template.repository.js"
import {
  createWorkReadyDoneControlsProjectRouter,
  createWorkReadyDoneControlsTemplateRouter,
} from "./routes/work-ready-done-controls.routes.js"
import { WorkReadyDoneControlsService } from "./services/work-ready-done-controls.service.js"

export type CreateWorkReadyDoneControlsServiceOptions = {
  projectProfiles: WorkControlsProjectProfileRepository
  workspaceTemplates: WorkControlsWorkspaceTemplateRepository
  overrideTokens: WorkControlOverrideTokenRepository
  workControlsAudit: WorkControlsAuditRepository
}

export function createWorkReadyDoneControlsService(
  projectRuntime: ProjectRuntimeService,
  backlog: ScrumBacklogRepository,
  impediments: ImpedimentRepository,
  options: CreateWorkReadyDoneControlsServiceOptions,
): WorkReadyDoneControlsService {
  return new WorkReadyDoneControlsService(projectRuntime, backlog, impediments, {
    projectProfiles: options.projectProfiles,
    workspaceTemplates: options.workspaceTemplates,
    overrideTokens: options.overrideTokens,
    workControlsAudit: options.workControlsAudit,
  })
}

export { WorkReadyDoneControlsService } from "./services/work-ready-done-controls.service.js"
export type { WorkReadyDoneTransitionPort } from "./services/work-ready-done-controls.service.js"

export type MountWorkReadyDoneControlsModuleOptions = {
  service: WorkReadyDoneControlsService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Rutas bajo `/v1/workspaces/:workspacePublicId/…`:
 * - Proyecto: `.../projects/:projectPublicId/work-controls[...]`
 * - Plantilla: `.../work-controls-template`
 */
export function mountWorkReadyDoneControlsModule(
  app: Express,
  options: MountWorkReadyDoneControlsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId",
    createWorkReadyDoneControlsProjectRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
  app.use(
    "/v1/workspaces/:workspacePublicId",
    createWorkReadyDoneControlsTemplateRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
