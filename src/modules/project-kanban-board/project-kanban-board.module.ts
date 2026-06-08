import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { KanbanBacklogService } from "../project-kanban-backlog/services/kanban-backlog.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkReadyDoneControlsService } from "../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkActivityNotificationFanoutService } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { createProjectKanbanBoardRouter } from "./routes/project-kanban-board.routes.js"
import { KanbanBoardService } from "./services/kanban-board.service.js"

export function createKanbanBoardService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  kanbanBacklogService: KanbanBacklogService,
  backlogRepository: ScrumBacklogRepository,
  auditLogRepository?: WorkspaceAuditLogRepository | null,
  workControls?: WorkReadyDoneControlsService | null,
  workActivityNotifications?: WorkActivityNotificationFanoutService | null,
): KanbanBoardService {
  return new KanbanBoardService(
    requireInjected(backlogRepository, "backlogRepository"),
    projectRuntimeService,
    kanbanFlowService,
    kanbanBacklogService,
    auditLogRepository ?? null,
    workControls ?? null,
    workActivityNotifications ?? null,
  )
}

export { KanbanBoardService } from "./services/kanban-board.service.js"

export type MountProjectKanbanBoardModuleOptions = {
  kanbanBoardService: KanbanBoardService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectKanbanBoardModule(
  app: Express,
  options: MountProjectKanbanBoardModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-board",
    createProjectKanbanBoardRouter(
      options.kanbanBoardService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
