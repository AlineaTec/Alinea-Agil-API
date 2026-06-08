import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { KanbanFlowNotFoundError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import { acceptanceCriteriaSummary } from "../../project-scrum-backlog/domain/acceptance-criterion.js"
import type { AcceptanceCriterionState } from "../../project-scrum-backlog/domain/acceptance-criterion.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import { attachWorkItemAssignmentRoutes } from "../../work-item-assignment/routes/work-item-assignment.routes.js"
import type { WorkItemAssignmentService } from "../../work-item-assignment/services/work-item-assignment.service.js"
import { attachWorkItemCommentsRoutes } from "../../work-item-comments/routes/work-item-comments.routes.js"
import type { WorkItemCommentsService } from "../../work-item-comments/services/work-item-comments.service.js"
import { attachWorkItemTimeEntriesRoutes } from "../../work-item-time-logging/routes/work-item-time-entries.routes.js"
import type { WorkItemTimeEntriesService } from "../../work-item-time-logging/services/work-item-time-entries.service.js"
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
  KanbanBoardWipLimitBlockedError,
  KanbanBoardWipMoveAckRequiredError,
  KanbanWipOverrideForbiddenError,
} from "../../project-kanban-board/domain/kanban-board.errors.js"
import {
  KanbanBacklogForbiddenError,
  KanbanBacklogNotFoundError,
  KanbanBacklogValidationError,
} from "../domain/kanban-backlog.errors.js"
import type { KanbanBacklogService } from "../services/kanban-backlog.service.js"
import {
  createKanbanBacklogItemBodySchema,
  kanbanBacklogItemPathParamsSchema,
  kanbanBacklogMountParamsSchema,
  listKanbanBacklogQuerySchema,
  patchKanbanBacklogItemBodySchema,
  releaseToFlowBodySchema,
  reorderKanbanBacklogBodySchema,
} from "../validation/project-kanban-backlog-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function acceptanceCriterionToJson(c: AcceptanceCriterionState) {
  return {
    acceptanceCriterionPublicId: c.acceptanceCriterionPublicId,
    text: c.text,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function kanbanBacklogItemToJson(s: ScrumBacklogItemState) {
  return {
    backlogItemPublicId: s.backlogItemPublicId,
    workspacePublicId: s.workspacePublicId,
    projectPublicId: s.projectPublicId,
    itemType: s.itemType,
    title: s.title,
    description: s.description,
    status: s.status,
    sortOrder: s.sortOrder,
    parentItemPublicId: s.parentItemPublicId,
    kanbanColumnPublicId: s.kanbanColumnPublicId,
    isBlocked: s.isBlocked,
    blockedReason: s.blockedReason,
    createdByUserPublicId: s.createdByUserPublicId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    completedInSprintPublicId: s.completedInSprintPublicId,
    assignedUserPublicId: s.assignedUserPublicId,
    assignmentUpdatedAt: s.assignmentUpdatedAt ? s.assignmentUpdatedAt.toISOString() : null,
    assignmentUpdatedByUserPublicId: s.assignmentUpdatedByUserPublicId,
    storyPoints: s.storyPoints,
    priorityLevel: s.priorityLevel,
    acceptanceCriteria: s.acceptanceCriteria.map(acceptanceCriterionToJson),
    acceptanceCriteriaSummary: acceptanceCriteriaSummary(s.acceptanceCriteria),
    commentsCount: s.commentsCount,
  }
}

function respondKanbanBacklogError(err: unknown, res: Response, next: NextFunction): void {
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
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-backlog`.
 */
export function createProjectKanbanBacklogRouter(
  kanbanBacklogService: KanbanBacklogService,
  workItemAssignmentService: WorkItemAssignmentService,
  workItemCommentsService: WorkItemCommentsService,
  workItemTimeEntriesService: WorkItemTimeEntriesService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  attachWorkItemAssignmentRoutes(router, workItemAssignmentService)
  attachWorkItemCommentsRoutes(router, workItemCommentsService)
  attachWorkItemTimeEntriesRoutes(router, workItemTimeEntriesService)

  router.get("/items", async (req, res, next) => {
    try {
      const parsed = kanbanBacklogMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const query = listKanbanBacklogQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: query.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const qd = query.data
      const assignmentFilter =
        qd.unassigned === "true" || qd.assignee || qd.assigneeUserPublicId
          ? {
              unassigned: qd.unassigned === "true" ? true : undefined,
              assignee: qd.assignee,
              assigneeUserPublicId: qd.assigneeUserPublicId,
            }
          : undefined
      const items = await kanbanBacklogService.listKanbanBacklog(actor, workspacePublicId, projectPublicId, {
        search: qd.q,
        assignmentFilter,
      })
      res.status(200).json({ items: items.map(kanbanBacklogItemToJson) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  router.post("/items", async (req, res, next) => {
    try {
      const parsedParams = kanbanBacklogMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = createKanbanBacklogItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const created = await kanbanBacklogService.createKanbanBacklogItem(
        actor,
        workspacePublicId,
        projectPublicId,
        body.data,
      )
      res.status(201).json({ item: kanbanBacklogItemToJson(created) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  router.post("/items/reorder", async (req, res, next) => {
    try {
      const parsedParams = kanbanBacklogMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = reorderKanbanBacklogBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const items = await kanbanBacklogService.reorderKanbanBacklog(
        actor,
        workspacePublicId,
        projectPublicId,
        body.data.orderedBacklogItemPublicIds,
      )
      res.status(200).json({ items: items.map(kanbanBacklogItemToJson) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  router.get("/items/:backlogItemPublicId", async (req, res, next) => {
    try {
      const parsed = kanbanBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const item = await kanbanBacklogService.getKanbanBacklogItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ item: kanbanBacklogItemToJson(item) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  router.patch("/items/:backlogItemPublicId", async (req, res, next) => {
    try {
      const parsed = kanbanBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = patchKanbanBacklogItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const updated = await kanbanBacklogService.updateKanbanBacklogItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data,
      )
      res.status(200).json({ item: kanbanBacklogItemToJson(updated) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/release-to-flow", async (req, res, next) => {
    try {
      const parsed = kanbanBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = releaseToFlowBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const item = await kanbanBacklogService.releaseItemToFlow(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        {
          allowWipOverride: body.data.allow_wip_override,
          kanbanWipMoveAck: body.data.kanban_wip_move_ack,
          kanbanWipOverrideReason: body.data.kanban_wip_override_reason ?? null,
          workControlOverrideToken: getWorkControlOverrideTokenFromRequest(req),
        },
      )
      res.status(200).json({ item: kanbanBacklogItemToJson(item) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/return-to-backlog", async (req, res, next) => {
    try {
      const parsed = kanbanBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const item = await kanbanBacklogService.returnItemToBacklog(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ item: kanbanBacklogItemToJson(item) })
    } catch (err) {
      respondKanbanBacklogError(err, res, next)
    }
  })

  return router
}
