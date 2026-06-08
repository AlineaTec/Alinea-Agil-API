import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkActivityNotificationFanoutService } from "../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { createWorkItemsRepositories } from "../../infrastructure/persistence/work-items-repositories.factory.js"
import type { WorkItemCommentsRepository } from "./persistence/work-item-comments.repository.js"
import { WorkItemCommentsService } from "./services/work-item-comments.service.js"

export function createWorkItemCommentsService(
  backlogRepository: ScrumBacklogRepository,
  projectRuntimeService: ProjectRuntimeService,
  workspaceUserService?: WorkspaceUserService | null,
  workActivityNotifications?: WorkActivityNotificationFanoutService | null,
  commentsRepository?: WorkItemCommentsRepository,
): WorkItemCommentsService {
  const comments = commentsRepository ?? createWorkItemsRepositories().comments
  return new WorkItemCommentsService(
    comments,
    backlogRepository,
    projectRuntimeService,
    workspaceUserService ?? null,
    workActivityNotifications ?? null,
  )
}

export { WorkItemCommentsService } from "./services/work-item-comments.service.js"
export { attachWorkItemCommentsRoutes, respondWorkItemCommentsError } from "./routes/work-item-comments.routes.js"
