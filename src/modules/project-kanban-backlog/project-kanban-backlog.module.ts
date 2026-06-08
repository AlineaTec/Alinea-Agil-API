import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkItemAssignmentService } from "../work-item-assignment/services/work-item-assignment.service.js"
import type { WorkItemCommentsService } from "../work-item-comments/services/work-item-comments.service.js"
import type { WorkItemTimeEntriesService } from "../work-item-time-logging/services/work-item-time-entries.service.js"
import type { WorkReadyDoneControlsService } from "../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkActivityNotificationFanoutService } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { createProjectKanbanBacklogRouter } from "./routes/project-kanban-backlog.routes.js"
import { KanbanBacklogService } from "./services/kanban-backlog.service.js"

export function createKanbanBacklogService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  backlogRepository: ScrumBacklogRepository,
  auditLogRepository?: WorkspaceAuditLogRepository | null,
  workControls?: WorkReadyDoneControlsService | null,
  workActivityNotifications?: WorkActivityNotificationFanoutService | null,
): KanbanBacklogService {
  return new KanbanBacklogService(
    requireInjected(backlogRepository, "backlogRepository"),
    projectRuntimeService,
    kanbanFlowService,
    auditLogRepository ?? null,
    workControls ?? null,
    workActivityNotifications ?? null,
  )
}

export { KanbanBacklogService } from "./services/kanban-backlog.service.js"

export type MountProjectKanbanBacklogModuleOptions = {
  kanbanBacklogService: KanbanBacklogService
  workItemAssignmentService: WorkItemAssignmentService
  workItemCommentsService: WorkItemCommentsService
  workItemTimeEntriesService: WorkItemTimeEntriesService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectKanbanBacklogModule(
  app: Express,
  options: MountProjectKanbanBacklogModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-backlog",
    createProjectKanbanBacklogRouter(
      options.kanbanBacklogService,
      options.workItemAssignmentService,
      options.workItemCommentsService,
      options.workItemTimeEntriesService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
