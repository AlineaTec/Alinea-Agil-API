import { Router, type NextFunction, type Response } from "express"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  ScrumBacklogForbiddenError,
  ScrumBacklogNotFoundError,
  ScrumBacklogValidationError,
} from "../../project-scrum-backlog/domain/scrum-backlog.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkItemCommentsService } from "../services/work-item-comments.service.js"
import {
  WorkItemCommentsForbiddenError,
  WorkItemCommentsNotFoundError,
  WorkItemCommentsValidationError,
} from "../domain/work-item-comments.errors.js"
import {
  createWorkItemCommentBodySchema,
  listWorkItemCommentsQuerySchema,
  patchWorkItemCommentBodySchema,
  workItemCommentPathParamsSchema,
} from "../validation/work-item-comments-http.schemas.js"
import { scrumBacklogItemPathParamsSchema } from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function commentToJson(c: {
  commentPublicId: string
  backlogItemPublicId: string
  body: string
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  deletedByUserPublicId: string | null
}) {
  return {
    commentPublicId: c.commentPublicId,
    backlogItemPublicId: c.backlogItemPublicId,
    body: c.body,
    createdByUserPublicId: c.createdByUserPublicId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    deletedByUserPublicId: c.deletedByUserPublicId,
  }
}

export function respondWorkItemCommentsError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkItemCommentsForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemCommentsValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemCommentsNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogNotFoundError) {
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
 * Rutas bajo el router del backlog (Scrum o Kanban). Prefijo: `/items/:backlogItemPublicId/comments`.
 */
export function attachWorkItemCommentsRoutes(router: Router, workItemCommentsService: WorkItemCommentsService): void {
  router.get("/items/:backlogItemPublicId/comments", async (req, res, next) => {
    try {
      const parsedParams = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const query = listWorkItemCommentsQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: query.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const result = await workItemCommentsService.listComments(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        query.data.limit,
        query.data.cursor,
      )
      res.status(200).json({
        comments: result.comments.map(commentToJson),
        nextCursor: result.nextCursor,
      })
    } catch (err) {
      respondWorkItemCommentsError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/comments", async (req, res, next) => {
    try {
      const parsedParams = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = createWorkItemCommentBodySchema.safeParse(req.body)
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
      const created = await workItemCommentsService.createComment(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.body,
      )
      res.status(201).json({ comment: commentToJson(created) })
    } catch (err) {
      respondWorkItemCommentsError(err, res, next)
    }
  })

  router.patch("/items/:backlogItemPublicId/comments/:commentPublicId", async (req, res, next) => {
    try {
      const parsedParams = workItemCommentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = patchWorkItemCommentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId, commentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await workItemCommentsService.patchComment(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        commentPublicId,
        body.data.body,
      )
      res.status(200).json({ comment: commentToJson(updated) })
    } catch (err) {
      respondWorkItemCommentsError(err, res, next)
    }
  })

  router.delete("/items/:backlogItemPublicId/comments/:commentPublicId", async (req, res, next) => {
    try {
      const parsedParams = workItemCommentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId, commentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      await workItemCommentsService.deleteComment(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        commentPublicId,
      )
      res.status(204).send()
    } catch (err) {
      respondWorkItemCommentsError(err, res, next)
    }
  })
}
