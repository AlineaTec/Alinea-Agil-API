import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { ProjectRuntimeForbiddenError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  GuidedRefinementConflictError,
  GuidedRefinementForbiddenError,
  GuidedRefinementNotFoundError,
  GuidedRefinementUnsupportedError,
  GuidedRefinementValidationError,
} from "../domain/guided-refinement.errors.js"
import type { GuidedRefinementService } from "../services/guided-refinement.service.js"
import {
  guidedRefinementAdditiveNoteBodySchema,
  guidedRefinementCloseBodySchema,
  guidedRefinementProjectParamsSchema,
  guidedRefinementRecentQuerySchema,
  guidedRefinementReviewBodySchema,
  guidedRefinementSessionHeaderBodySchema,
  guidedRefinementTodayQuerySchema,
  guidedRefinementWorkItemParamsSchema,
} from "../validation/guided-refinement-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondErr(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ProjectRuntimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRefinementForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRefinementNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRefinementConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRefinementUnsupportedError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRefinementValidationError) {
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

function sessionJson(s: import("../domain/guided-refinement-session.js").GuidedRefinementSessionState) {
  return {
    ...s,
    startedAt: s.startedAt?.toISOString() ?? null,
    closedAt: s.closedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function reviewJson(
  r: import("../domain/guided-refinement-reviewed-item.js").GuidedRefinementReviewedItemState & {
    readinessSignals: import("../domain/guided-refinement-readiness-signal.js").GuidedReadinessSignalDto[]
  },
) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

/**
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-refinement`
 */
export function createGuidedRefinementRouter(
  service: GuidedRefinementService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/today", async (req, res, next) => {
    try {
      const params = guidedRefinementProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getTodayBootstrap(actor, params.data.workspacePublicId, params.data.projectPublicId, {
        sessionDate: query.data.sessionDate,
        sessionSlot: query.data.sessionSlot,
      })
      res.status(200).json({
        ...result,
        session: result.session ? sessionJson(result.session) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/session", async (req, res, next) => {
    try {
      const params = guidedRefinementProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRefinementSessionHeaderBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.upsertSessionHeader(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/reviewed-items", async (req, res, next) => {
    try {
      const params = guidedRefinementProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.listReviewedItemsForToday(actor, params.data.workspacePublicId, params.data.projectPublicId, {
        sessionDate: query.data.sessionDate,
        sessionSlot: query.data.sessionSlot,
      })
      res.status(200).json({
        session: result.session ? sessionJson(result.session) : null,
        items: result.items.map(reviewJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/reviewed-items/:workItemPublicId", async (req, res, next) => {
    try {
      const params = guidedRefinementWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getReviewedItemForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: result.session ? sessionJson(result.session) : null,
        review: result.review ? reviewJson(result.review) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/reviewed-items/:workItemPublicId", async (req, res, next) => {
    try {
      const params = guidedRefinementWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRefinementReviewBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const review = await service.upsertReviewedItemForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(200).json({ review: reviewJson(review) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/close", async (req, res, next) => {
    try {
      const params = guidedRefinementProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRefinementCloseBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.closeToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/additive-note", async (req, res, next) => {
    try {
      const params = guidedRefinementProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRefinementAdditiveNoteBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.appendAdditiveNoteAfterClose(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data.note,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/recent", async (req, res, next) => {
    try {
      const params = guidedRefinementProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRefinementRecentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const sessions = await service.listRecentSessions(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data.limit ?? 20,
      )
      res.status(200).json({ sessions: sessions.map(sessionJson) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/work-items/:workItemPublicId/latest-review", async (req, res, next) => {
    try {
      const params = guidedRefinementWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getLatestReviewForWorkItem(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
      )
      res.status(200).json({
        supportLevel: result.supportLevel,
        operationalApproach: result.operationalApproach,
        operationalTimeZone: result.operationalTimeZone,
        guidedRefinementOperable: result.guidedRefinementOperable,
        review: result.review
          ? {
              ...result.review,
              createdAt: result.review.createdAt.toISOString(),
              updatedAt: result.review.updatedAt.toISOString(),
              readinessSignals: result.readinessSignals,
            }
          : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}
