import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { KanbanFlowRepository } from "./persistence/kanban-flow.repository.js"
import { createProjectKanbanCoreRouter } from "./routes/project-kanban-core.routes.js"
import { KanbanFlowService } from "./services/kanban-flow.service.js"

export function createKanbanFlowService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowRepository: KanbanFlowRepository,
): KanbanFlowService {
  return new KanbanFlowService(kanbanFlowRepository, projectRuntimeService)
}

export { KanbanFlowService } from "./services/kanban-flow.service.js"

export type MountProjectKanbanCoreModuleOptions = {
  kanbanFlowService: KanbanFlowService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * `GET .../projects/:projectPublicId/kanban/flow` — configuración del flujo (columnas + entrada).
 */
export function mountProjectKanbanCoreModule(
  app: Express,
  options: MountProjectKanbanCoreModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban",
    createProjectKanbanCoreRouter(
      options.kanbanFlowService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
