import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectsRepositories } from "../../infrastructure/persistence/projects-repositories.factory.js"
import type { ProjectDraftRepository } from "./persistence/project-draft.repository.js"
import { createWorkspaceProjectsRouter } from "./routes/workspace-projects.routes.js"
import { ProjectDraftService } from "./services/project-draft.service.js"

export function createProjectDraftService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  draftRepository?: ProjectDraftRepository,
): ProjectDraftService {
  const draft = draftRepository ?? createProjectsRepositories().draft
  return new ProjectDraftService(draft, projectRuntimeService, kanbanFlowService)
}

export { ProjectDraftService } from "./services/project-draft.service.js"
export type { ProjectDraftState } from "./domain/project-draft.js"
export type { ProjectDraftStatus } from "./domain/project-draft-status.js"
export type { ManagementApproach } from "./domain/management-approach.js"

export type MountWorkspaceProjectsModuleOptions = {
  projectDraftService: ProjectDraftService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * Monta `/v1/workspaces/:workspacePublicId/projects/drafts` (crear, listar, obtener).
 */
export function mountWorkspaceProjectsModule(
  app: Express,
  options: MountWorkspaceProjectsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/drafts",
    createWorkspaceProjectsRouter(
      options.projectDraftService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
