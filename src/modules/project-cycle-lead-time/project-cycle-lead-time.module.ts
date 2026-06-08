import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createProjectCycleLeadTimeRouter } from "./routes/project-cycle-lead-time.routes.js"
import { FlowTimeService } from "./services/flow-time.service.js"

export function createFlowTimeService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  backlogRepository: ScrumBacklogRepository,
  auditLogRepository: WorkspaceAuditLogRepository | null,
): FlowTimeService {
  return new FlowTimeService(
    projectRuntimeService,
    kanbanFlowService,
    backlogRepository,
    auditLogRepository,
  )
}

export { FlowTimeService } from "./services/flow-time.service.js"

export type MountProjectCycleLeadTimeModuleOptions = {
  flowTimeService: FlowTimeService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProjectCycleLeadTimeModule(
  app: Express,
  options: MountProjectCycleLeadTimeModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-metrics/flow-time",
    createProjectCycleLeadTimeRouter(
      options.flowTimeService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
