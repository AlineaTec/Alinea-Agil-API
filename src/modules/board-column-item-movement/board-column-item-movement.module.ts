import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { KanbanBoardService } from "../project-kanban-board/services/kanban-board.service.js"
import type { KanbanFlowService } from "../project-kanban-core/services/kanban-flow.service.js"
import type { SprintBoardService } from "../project-scrum-sprint-board/services/sprint-board.service.js"
import { BoardColumnItemMovementService } from "./services/board-column-item-movement.service.js"
import { createBoardColumnItemMovementRouter } from "./routes/board-column-item-movement.routes.js"

export type CreateBoardColumnItemMovementServiceOptions = {
  sprintRepo: ScrumSprintPlanningRepository
  backlogRepo: ScrumBacklogRepository
}

export function createBoardColumnItemMovementService(
  projectRuntimeService: ProjectRuntimeService,
  kanbanFlowService: KanbanFlowService,
  sprintBoardService: SprintBoardService,
  kanbanBoardService: KanbanBoardService,
  options: CreateBoardColumnItemMovementServiceOptions,
): BoardColumnItemMovementService {
  return new BoardColumnItemMovementService(
    projectRuntimeService,
    options.sprintRepo,
    options.backlogRepo,
    kanbanFlowService,
    sprintBoardService,
    kanbanBoardService,
  )
}

export { BoardColumnItemMovementService } from "./services/board-column-item-movement.service.js"

export type MountBoardColumnItemMovementModuleOptions = {
  service: BoardColumnItemMovementService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * `POST` move/reorder bajo
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/board`
 */
export function mountBoardColumnItemMovementModule(app: Express, options: MountBoardColumnItemMovementModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/board",
    createBoardColumnItemMovementRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
