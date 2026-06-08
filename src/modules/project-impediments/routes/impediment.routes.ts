import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { ProjectRuntimeInvalidInputError, ProjectRuntimeNotFoundError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { ImpedimentState } from "../domain/impediment.js"
import type { ProjectImpedimentCommentState } from "../domain/project-impediment-comment.js"
import {
  ProjectImpedimentCommentNotFoundError,
  ImpedimentForbiddenError,
  ImpedimentNotFoundError,
  ImpedimentValidationError,
} from "../domain/impediment.errors.js"
import type { ProjectImpedimentCommentsService } from "../services/impediment-comments.service.js"
import type { ImpedimentService } from "../services/impediment.service.js"
import {
  createImpedimentBodySchema,
  dismissImpedimentBodySchema,
  impedimentMountParamsSchema,
  impedimentPathParamsSchema,
  listImpedimentsQuerySchema,
  parseStatusFilter,
  patchImpedimentBodySchema,
  reopenImpedimentBodySchema,
  resolveImpedimentBodySchema,
} from "../validation/impediment-http.schemas.js"
import {
  createProjectImpedimentCommentBodySchema,
  impedimentCommentPathParamsSchema,
  listProjectImpedimentCommentsQuerySchema,
  patchProjectImpedimentCommentBodySchema,
} from "../validation/impediment-comments-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function impedimentToJson(s: ImpedimentState) {
  return {
    impedimentPublicId: s.impedimentPublicId,
    workspacePublicId: s.workspacePublicId,
    projectPublicId: s.projectPublicId,
    relatedWorkItemPublicId: s.relatedWorkItemPublicId,
    relatedSprintPublicId: s.relatedSprintPublicId,
    title: s.title,
    description: s.description,
    status: s.status,
    severity: s.severity,
    responsibleUserPublicId: s.responsibleUserPublicId,
    reportedByUserPublicId: s.reportedByUserPublicId,
    detectedAt: s.detectedAt.toISOString(),
    resolvedAt: s.resolvedAt ? s.resolvedAt.toISOString() : null,
    dismissedAt: s.dismissedAt ? s.dismissedAt.toISOString() : null,
    resolutionSummary: s.resolutionSummary,
    dismissalReason: s.dismissalReason,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function impedimentCommentToJson(c: ProjectImpedimentCommentState) {
  const createdMs = c.createdAt.getTime()
  const updatedMs = c.updatedAt.getTime()
  return {
    commentPublicId: c.commentPublicId,
    impedimentPublicId: c.impedimentPublicId,
    body: c.body,
    createdByUserPublicId: c.createdByUserPublicId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    isEdited: updatedMs > createdMs,
  }
}

export function respondImpedimentError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ImpedimentForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ImpedimentValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectImpedimentCommentNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ImpedimentNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeInvalidInputError) {
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

export function createProjectImpedimentsRouter(
  impedimentService: ImpedimentService,
  impedimentCommentsService: ProjectImpedimentCommentsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const parsedParams = impedimentMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const query = listImpedimentsQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: query.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const q = query.data
      const limit = q.limit ?? 20
      const offset = q.offset ?? 0
      const statusFilter = parseStatusFilter(q.status)
      const actor = getRequiredActor(res)
      const result = await impedimentService.listImpediments(
        actor,
        workspacePublicId,
        projectPublicId,
        {
          status: statusFilter,
          severity: q.severity,
          responsibleUserPublicId: q.responsibleUserPublicId,
          relatedWorkItemPublicId: q.relatedWorkItemPublicId,
          relatedSprintPublicId: q.relatedSprintPublicId,
        },
        { limit, offset },
      )
      res.status(200).json({
        items: result.items.map(impedimentToJson),
        totalCount: result.totalCount,
        limit,
        offset,
      })
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.post("/", async (req, res, next) => {
    try {
      const parsedParams = impedimentMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = createImpedimentBodySchema.safeParse(req.body)
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
      const created = await impedimentService.createImpediment(
        actor,
        workspacePublicId,
        projectPublicId,
        {
          title: body.data.title,
          description: body.data.description,
          severity: body.data.severity,
          responsibleUserPublicId: body.data.responsibleUserPublicId,
          relatedWorkItemPublicId: body.data.relatedWorkItemPublicId,
          relatedSprintPublicId: body.data.relatedSprintPublicId,
          detectedAt: body.data.detectedAt,
        },
      )
      res.status(201).json(impedimentToJson(created))
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.get("/:impedimentPublicId/comments", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const query = listProjectImpedimentCommentsQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: query.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const result = await impedimentCommentsService.listComments(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        query.data.limit,
        query.data.cursor,
      )
      res.status(200).json({
        comments: result.comments.map(impedimentCommentToJson),
        nextCursor: result.nextCursor,
      })
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.post("/:impedimentPublicId/comments", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = createProjectImpedimentCommentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const created = await impedimentCommentsService.createComment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        body.data.body,
      )
      res.status(201).json({ comment: impedimentCommentToJson(created) })
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.patch("/:impedimentPublicId/comments/:commentPublicId", async (req, res, next) => {
    try {
      const parsedParams = impedimentCommentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = patchProjectImpedimentCommentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId, commentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await impedimentCommentsService.patchComment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        commentPublicId,
        body.data.body,
      )
      res.status(200).json({ comment: impedimentCommentToJson(updated) })
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.delete("/:impedimentPublicId/comments/:commentPublicId", async (req, res, next) => {
    try {
      const parsedParams = impedimentCommentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId, commentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      await impedimentCommentsService.deleteComment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        commentPublicId,
      )
      res.status(204).send()
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.get("/:impedimentPublicId", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const row = await impedimentService.getImpediment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
      )
      res.status(200).json(impedimentToJson(row))
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.patch("/:impedimentPublicId", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = patchImpedimentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await impedimentService.patchImpediment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        body.data,
      )
      res.status(200).json(impedimentToJson(updated))
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.post("/:impedimentPublicId/resolve", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = resolveImpedimentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await impedimentService.resolveImpediment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        body.data.resolutionSummary,
      )
      res.status(200).json(impedimentToJson(updated))
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.post("/:impedimentPublicId/dismiss", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = dismissImpedimentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await impedimentService.dismissImpediment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
        body.data.dismissalReason,
      )
      res.status(200).json(impedimentToJson(updated))
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  router.post("/:impedimentPublicId/reopen", async (req, res, next) => {
    try {
      const parsedParams = impedimentPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = reopenImpedimentBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, impedimentPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await impedimentService.reopenImpediment(
        actor,
        workspacePublicId,
        projectPublicId,
        impedimentPublicId,
      )
      res.status(200).json(impedimentToJson(updated))
    } catch (err) {
      respondImpedimentError(err, res, next)
    }
  })

  return router
}
