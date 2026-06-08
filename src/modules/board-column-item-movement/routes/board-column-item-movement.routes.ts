import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import {
  KanbanBoardValidationError,
  KanbanBoardForbiddenError,
  KanbanBoardNotFoundError,
  KanbanBoardWipLimitBlockedError,
  KanbanBoardWipMoveAckRequiredError,
  KanbanWipOverrideForbiddenError,
} from "../../project-kanban-board/domain/kanban-board.errors.js"
import { KanbanFlowNotFoundError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import {
  SprintBoardForbiddenError,
  SprintBoardNotFoundError,
  SprintBoardValidationError,
} from "../../project-scrum-sprint-board/domain/sprint-board.errors.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { getWorkControlOverrideTokenFromRequest } from "../../work-ready-done-controls/utils/work-controls-http.util.js"
import {
  WorkControlsBlockedError,
  WorkControlsValidationError,
} from "../../work-ready-done-controls/domain/work-ready-done-controls.errors.js"
import {
  BoardColumnItemMovementForbiddenError,
  BoardColumnMismatchError,
  BoardItemMoveContextError,
} from "../domain/board-column-item-movement.errors.js"
import type { BoardColumnItemMovementService } from "../services/board-column-item-movement.service.js"
import {
  assertCanExecuteBoardItemMove,
  assertCanExecuteBoardItemReorder,
} from "../policies/board-column-item-movement-authorization.policy.js"
import { boardItemParamsSchema, boardItemMoveBodySchema, boardItemReorderBodySchema } from "../validation/board-column-item-movement-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondBoardItemMovementError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof BoardColumnItemMovementForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof BoardColumnMismatchError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof BoardItemMoveContextError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkControlsBlockedError) {
    res.status(409).json({
      error: err.code,
      message: err.message,
      work_controls: err.payload,
    })
    return
  }
  if (err instanceof WorkControlsValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanBoardValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanBoardNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanBoardWipMoveAckRequiredError) {
    res.status(409).json({
      error: err.code,
      message: err.message,
      requires_wip_move_ack: err.requiresWipMoveAck,
      current_count: err.currentCount,
      wip_limit: err.wipLimit,
      to_column_public_id: err.toColumnPublicId,
      policy: err.policy,
      projected_count_after_move: err.projectedCountAfterMove,
    })
    return
  }
  if (err instanceof KanbanBoardWipLimitBlockedError) {
    res.status(409).json({
      error: err.code,
      message: err.message,
      requires_wip_override: err.requiresWipOverride,
      requires_wip_override_reason: err.requiresWipOverrideReason,
      current_count: err.currentCount,
      wip_limit: err.wipLimit,
      to_column_public_id: err.toColumnPublicId,
      policy: err.policy,
      projected_count_after_move: err.projectedCountAfterMove,
    })
    return
  }
  if (err instanceof KanbanWipOverrideForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanFlowNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeInvalidInputError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({
      error: "internal_error",
      message: "Workspace actor context missing after auth middleware.",
    })
    return
  }
  next(err)
}

/**
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/board`
 */
export function createBoardColumnItemMovementRouter(
  service: BoardColumnItemMovementService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.post("/items/:workItemPublicId/move", async (req, res, next) => {
    try {
      const p = boardItemParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_params", details: p.error.flatten() })
        return
      }
      const b = boardItemMoveBodySchema.safeParse(req.body ?? {})
      if (!b.success) {
        res.status(400).json({ error: "invalid_body", details: b.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanExecuteBoardItemMove(actor)
      const result = await service.move(
        actor,
        p.data.workspacePublicId,
        p.data.projectPublicId,
        p.data.workItemPublicId,
        {
          sprintPublicId: b.data.sprint_public_id,
          fromColumnPublicId: b.data.from_column_public_id,
          toColumnPublicId: b.data.to_column_public_id,
          allowWipOverride: b.data.allow_wip_override,
          kanbanWipMoveAck: b.data.kanban_wip_move_ack,
          kanbanWipOverrideReason: b.data.kanban_wip_override_reason ?? null,
        },
        getWorkControlOverrideTokenFromRequest(req),
      )
      res.status(200).json(result)
    } catch (err) {
      respondBoardItemMovementError(err, res, next)
    }
  })

  router.post("/items/:workItemPublicId/reorder", async (req, res, next) => {
    try {
      const p = boardItemParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_params", details: p.error.flatten() })
        return
      }
      const b = boardItemReorderBodySchema.safeParse(req.body ?? {})
      if (!b.success) {
        res.status(400).json({ error: "invalid_body", details: b.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanExecuteBoardItemReorder(actor)
      const result = await service.reorder(actor, p.data.workspacePublicId, p.data.projectPublicId, p.data.workItemPublicId, {
        sprintPublicId: b.data.sprint_public_id,
        columnPublicId: b.data.column_public_id,
        placedBeforeBacklogItemPublicId: b.data.placed_before_backlog_item_public_id,
      })
      res.status(200).json(result)
    } catch (err) {
      respondBoardItemMovementError(err, res, next)
    }
  })

  return router
}
