import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { ProjectRuntimeForbiddenError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  GuidedReviewConflictError,
  GuidedReviewForbiddenError,
  GuidedReviewNotFoundError,
  GuidedReviewUnsupportedError,
  GuidedReviewValidationError,
} from "../domain/guided-review.errors.js"
import type { GuidedReviewService } from "../services/guided-review.service.js"
import {
  guidedReviewAdditiveNoteBodySchema,
  guidedReviewCloseBodySchema,
  guidedReviewDemonstratedItemBodySchema,
  guidedReviewFeedbackBodySchema,
  guidedReviewProjectParamsSchema,
  guidedReviewRecentQuerySchema,
  guidedReviewSessionHeaderBodySchema,
  guidedReviewTodayQuerySchema,
  guidedReviewTranscriptAfterCloseBodySchema,
  guidedReviewWorkItemParamsSchema,
} from "../validation/guided-review-http.schemas.js"

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
  if (err instanceof GuidedReviewForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedReviewNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedReviewConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedReviewUnsupportedError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedReviewValidationError) {
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

function sessionJson(s: import("../domain/guided-review-session.js").GuidedReviewSessionState) {
  return {
    ...s,
    transcriptAfterClose: s.transcriptAfterClose
      ? {
          text: s.transcriptAfterClose.text,
          updatedAt: s.transcriptAfterClose.updatedAt.toISOString(),
          updatedByUserPublicId: s.transcriptAfterClose.updatedByUserPublicId,
        }
      : null,
    additiveNotesAfterClose: s.additiveNotesAfterClose.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    startedAt: s.startedAt?.toISOString() ?? null,
    closedAt: s.closedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function itemJson(i: import("../domain/guided-review-demonstrated-item.js").GuidedReviewDemonstratedItemState) {
  return {
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }
}

function feedbackJson(f: import("../domain/guided-review-feedback.js").GuidedReviewFeedbackState) {
  return {
    ...f,
    createdAt: f.createdAt.toISOString(),
  }
}

/**
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-review`
 */
export function createGuidedReviewRouter(
  service: GuidedReviewService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/today", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
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
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedReviewSessionHeaderBodySchema.safeParse(req.body)
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

  router.get("/today/demonstrated-items", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.listDemonstratedItemsForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: out.session ? sessionJson(out.session) : null,
        items: out.items.map(itemJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/demonstrated-items/:workItemPublicId", async (req, res, next) => {
    try {
      const params = guidedReviewWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.getDemonstratedItemForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: out.session ? sessionJson(out.session) : null,
        item: out.item ? itemJson(out.item) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/demonstrated-items/:workItemPublicId", async (req, res, next) => {
    try {
      const params = guidedReviewWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedReviewDemonstratedItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const item = await service.upsertDemonstratedItemForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(200).json({ item: itemJson(item) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/feedback", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.listFeedbackForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: out.session ? sessionJson(out.session) : null,
        feedback: out.feedback.map(feedbackJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/feedback", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedReviewFeedbackBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const row = await service.appendFeedbackForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(201).json({ feedback: feedbackJson(row) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/close", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedReviewCloseBodySchema.safeParse(req.body)
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

  router.post("/today/transcript-after-close", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedReviewTranscriptAfterCloseBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.upsertTranscriptAfterClose(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data.transcript,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/additive-note", async (req, res, next) => {
    try {
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedReviewAdditiveNoteBodySchema.safeParse(req.body)
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
      const params = guidedReviewProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedReviewRecentQuerySchema.safeParse(req.query)
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
      const params = guidedReviewWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getLatestDemonstrationForWorkItem(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
      )
      res.status(200).json({
        supportLevel: result.supportLevel,
        guidedReviewOperable: result.guidedReviewOperable,
        operationalApproach: result.operationalApproach,
        operationalTimeZone: result.operationalTimeZone,
        session: result.session ? sessionJson(result.session) : null,
        demonstratedItem: result.demonstratedItem ? itemJson(result.demonstratedItem) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}
