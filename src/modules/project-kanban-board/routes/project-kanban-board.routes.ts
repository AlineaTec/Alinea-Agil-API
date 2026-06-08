import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { KanbanFlowNotFoundError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  KanbanBacklogForbiddenError,
  KanbanBacklogNotFoundError,
  KanbanBacklogValidationError,
} from "../../project-kanban-backlog/domain/kanban-backlog.errors.js"
import { getWorkControlOverrideTokenFromRequest } from "../../work-ready-done-controls/utils/work-controls-http.util.js"
import {
  WorkControlsBlockedError,
  WorkControlsValidationError,
} from "../../work-ready-done-controls/domain/work-ready-done-controls.errors.js"
import {
  KanbanBoardForbiddenError,
  KanbanBoardNotFoundError,
  KanbanBoardValidationError,
  KanbanBoardWipLimitBlockedError,
  KanbanBoardWipMoveAckRequiredError,
  KanbanWipOverrideForbiddenError,
} from "../domain/kanban-board.errors.js"
import type { KanbanBoardService } from "../services/kanban-board.service.js"
import {
  blockKanbanBoardItemBodySchema,
  kanbanBoardItemPathParamsSchema,
  kanbanBoardMountParamsSchema,
  moveKanbanBoardItemBodySchema,
  patchBlockedReasonBodySchema,
} from "../validation/project-kanban-board-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondKanbanBoardError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof KanbanBoardForbiddenError) {
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
  if (err instanceof KanbanBacklogForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanBacklogValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanBacklogNotFoundError) {
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
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-board`
 */
export function createProjectKanbanBoardRouter(
  kanbanBoardService: KanbanBoardService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/snapshot", async (req, res, next) => {
    try {
      const parsed = kanbanBoardMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const snapshot = await kanbanBoardService.getBoardSnapshot(actor, workspacePublicId, projectPublicId)
      res.status(200).json(snapshot)
    } catch (err) {
      respondKanbanBoardError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/move", async (req, res, next) => {
    try {
      const parsedParams = kanbanBoardItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = moveKanbanBoardItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const item = await kanbanBoardService.moveItemToColumn(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.to_column_public_id,
        {
          allowWipOverride: body.data.allow_wip_override,
          kanbanWipMoveAck: body.data.kanban_wip_move_ack,
          kanbanWipOverrideReason: body.data.kanban_wip_override_reason ?? null,
          workControlOverrideToken: getWorkControlOverrideTokenFromRequest(req),
        },
      )
      res.status(200).json({
        item: {
          backlogItemPublicId: item.backlogItemPublicId,
          kanbanColumnPublicId: item.kanbanColumnPublicId,
          sortOrder: item.sortOrder,
          updatedAt: item.updatedAt.toISOString(),
        },
      })
    } catch (err) {
      respondKanbanBoardError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/block", async (req, res, next) => {
    try {
      const parsedParams = kanbanBoardItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = blockKanbanBoardItemBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const item = await kanbanBoardService.blockItem(actor, workspacePublicId, projectPublicId, backlogItemPublicId, {
        blockedReason: body.data.blocked_reason,
      })
      res.status(200).json({
        item: {
          backlogItemPublicId: item.backlogItemPublicId,
          isBlocked: item.isBlocked,
          blockedReason: item.blockedReason,
          updatedAt: item.updatedAt.toISOString(),
        },
      })
    } catch (err) {
      respondKanbanBoardError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/unblock", async (req, res, next) => {
    try {
      const parsedParams = kanbanBoardItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const item = await kanbanBoardService.unblockItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({
        item: {
          backlogItemPublicId: item.backlogItemPublicId,
          isBlocked: item.isBlocked,
          blockedReason: item.blockedReason,
          updatedAt: item.updatedAt.toISOString(),
        },
      })
    } catch (err) {
      respondKanbanBoardError(err, res, next)
    }
  })

  router.patch("/items/:backlogItemPublicId/blocked-reason", async (req, res, next) => {
    try {
      const parsedParams = kanbanBoardItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = patchBlockedReasonBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const item = await kanbanBoardService.updateBlockedReason(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.blocked_reason,
      )
      res.status(200).json({
        item: {
          backlogItemPublicId: item.backlogItemPublicId,
          isBlocked: item.isBlocked,
          blockedReason: item.blockedReason,
          updatedAt: item.updatedAt.toISOString(),
        },
      })
    } catch (err) {
      respondKanbanBoardError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/return-to-backlog", async (req, res, next) => {
    try {
      const parsedParams = kanbanBoardItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const item = await kanbanBoardService.returnItemFromBoardToBacklog(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({
        item: {
          backlogItemPublicId: item.backlogItemPublicId,
          kanbanColumnPublicId: item.kanbanColumnPublicId,
          sortOrder: item.sortOrder,
          isBlocked: item.isBlocked,
          blockedReason: item.blockedReason,
          updatedAt: item.updatedAt.toISOString(),
        },
      })
    } catch (err) {
      respondKanbanBoardError(err, res, next)
    }
  })

  return router
}
