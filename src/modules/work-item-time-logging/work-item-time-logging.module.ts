import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { createWorkItemsRepositories } from "../../infrastructure/persistence/work-items-repositories.factory.js"
import type { WorkItemTimeEntriesRepository } from "./persistence/work-item-time-entries.repository.js"
import { WorkItemTimeEntriesService } from "./services/work-item-time-entries.service.js"

export function createWorkItemTimeEntriesService(
  backlogRepository: ScrumBacklogRepository,
  projectRuntimeService: ProjectRuntimeService,
  auditLogRepository: WorkspaceAuditLogRepository | null,
  timeEntriesRepository?: WorkItemTimeEntriesRepository,
): WorkItemTimeEntriesService {
  const timeEntries = timeEntriesRepository ?? createWorkItemsRepositories().timeEntries
  return new WorkItemTimeEntriesService(
    timeEntries,
    backlogRepository,
    projectRuntimeService,
    auditLogRepository,
  )
}

export { WorkItemTimeEntriesService } from "./services/work-item-time-entries.service.js"
export { attachWorkItemTimeEntriesRoutes, respondWorkItemTimeEntriesError } from "./routes/work-item-time-entries.routes.js"
