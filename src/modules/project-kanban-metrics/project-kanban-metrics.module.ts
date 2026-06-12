import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { FlowTimeService } from "../project-cycle-lead-time/services/flow-time.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectKanbanMetricsRouter } from "./routes/project-kanban-metrics.routes.js"
import { KanbanMetricsService } from "./services/kanban-metrics.service.js"

export function createKanbanMetricsService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  backlogRepository: ScrumBacklogRepository,
  auditLogRepository?: WorkspaceAuditLogRepository | null,
): KanbanMetricsService {
  return new KanbanMetricsService(
    requireInjected(backlogRepository, "backlogRepository"),
    projectRuntimeService,
    kanbanFlowService,
    auditLogRepository ?? null,
  )
}

export { KanbanMetricsService } from "./services/kanban-metrics.service.js"

export type MountProjectKanbanMetricsModuleOptions = {
  kanbanMetricsService: KanbanMetricsService
  flowTimeService: FlowTimeService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectKanbanMetricsModule(
  app: Express,
  options: MountProjectKanbanMetricsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-metrics",
    createProjectKanbanMetricsRouter(
      options.kanbanMetricsService,
      options.flowTimeService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
