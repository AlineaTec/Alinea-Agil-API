import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createKanbanWipRouter } from "./routes/kanban-wip.routes.js"
import { KanbanWipConfigService } from "./services/kanban-wip-config.service.js"

export function createKanbanWipConfigService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  scrumBacklogRepository: ScrumBacklogRepository,
  auditLogRepository: WorkspaceAuditLogRepository | null,
): KanbanWipConfigService {
  return new KanbanWipConfigService(
    projectRuntimeService,
    kanbanFlowService,
    scrumBacklogRepository,
    auditLogRepository,
  )
}

export { KanbanWipConfigService } from "./services/kanban-wip-config.service.js"

export type MountProjectKanbanWipLimitsOptions = {
  service: KanbanWipConfigService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * `GET`/`PATCH` `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-wip`
 */
export function mountProjectKanbanWipLimitsModule(app: Express, options: MountProjectKanbanWipLimitsOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId",
    createKanbanWipRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
