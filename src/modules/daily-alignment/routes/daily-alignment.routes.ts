import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { ProjectRuntimeForbiddenError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  DailyAlignmentConflictError,
  DailyAlignmentForbiddenError,
  DailyAlignmentNotFoundError,
  DailyAlignmentUnsupportedError,
  DailyAlignmentValidationError,
} from "../domain/daily-alignment.errors.js"
import type { DailyAlignmentService } from "../services/daily-alignment.service.js"
import {
  dailyAlignmentCloseBodySchema,
  dailyAlignmentMyUpdateBodySchema,
  dailyAlignmentProjectParamsSchema,
  dailyAlignmentRecentQuerySchema,
  dailyAlignmentSessionPublicIdParamsSchema,
  dailyAlignmentFacilitatorTranscriptBodySchema,
  dailyAlignmentTodayQuerySchema,
} from "../validation/daily-alignment-http.schemas.js"

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
  if (err instanceof DailyAlignmentForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof DailyAlignmentNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof DailyAlignmentConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof DailyAlignmentUnsupportedError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof DailyAlignmentValidationError) {
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
 * Montaje bajo `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/daily-alignment`
 */
export function createDailyAlignmentRouter(
  service: DailyAlignmentService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/today", async (req, res, next) => {
    try {
      const params = dailyAlignmentProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = dailyAlignmentTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getTodayBootstrap(actor, params.data.workspacePublicId, params.data.projectPublicId, {
        sessionDate: query.data.sessionDate,
        sessionSlot: query.data.sessionSlot,
      })
      res.status(200).json(result)
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/my-update", async (req, res, next) => {
    try {
      const params = dailyAlignmentProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = dailyAlignmentTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getMyUpdate(actor, params.data.workspacePublicId, params.data.projectPublicId, {
        sessionDate: query.data.sessionDate,
        sessionSlot: query.data.sessionSlot,
      })
      res.status(200).json(result)
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/my-update", async (req, res, next) => {
    try {
      const params = dailyAlignmentProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = dailyAlignmentTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = dailyAlignmentMyUpdateBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.upsertMyUpdate(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        {
          sessionDate: query.data.sessionDate,
          sessionSlot: query.data.sessionSlot,
        },
        body.data,
      )
      res.status(200).json(result)
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/session", async (req, res, next) => {
    try {
      const params = dailyAlignmentProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = dailyAlignmentTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getSessionForFacilitator(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        {
          sessionDate: query.data.sessionDate,
          sessionSlot: query.data.sessionSlot,
        },
      )
      res.status(200).json(result)
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/close", async (req, res, next) => {
    try {
      const params = dailyAlignmentProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = dailyAlignmentTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = dailyAlignmentCloseBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const closed = await service.closeSession(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        {
          sessionDate: query.data.sessionDate,
          sessionSlot: query.data.sessionSlot,
        },
        body.data,
      )
      res.status(200).json({ session: closed })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/recent", async (req, res, next) => {
    try {
      const params = dailyAlignmentProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = dailyAlignmentRecentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const sessions = await service.getRecentSessions(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data.limit ?? 10,
      )
      res.status(200).json({ sessions })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/sessions/:sessionPublicId", async (req, res, next) => {
    try {
      const params = dailyAlignmentSessionPublicIdParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getSessionDetailByPublicId(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.sessionPublicId,
      )
      res.status(200).json(result)
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.patch("/sessions/:sessionPublicId/facilitator-transcript", async (req, res, next) => {
    try {
      const params = dailyAlignmentSessionPublicIdParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const body = dailyAlignmentFacilitatorTranscriptBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.patchFacilitatorTranscript(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.sessionPublicId,
        body.data.facilitatorTranscript,
      )
      res.status(200).json({ session })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}
