import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { ProjectRuntimeForbiddenError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  GuidedSprintPlanningCommitApplyError,
  GuidedSprintPlanningConflictError,
  GuidedSprintPlanningForbiddenError,
  GuidedSprintPlanningNotFoundError,
  GuidedSprintPlanningUnsupportedError,
  GuidedSprintPlanningValidationError,
} from "../domain/guided-sprint-planning.errors.js"
import type { GuidedSprintPlanningService } from "../services/guided-sprint-planning.service.js"
import {
  guidedSprintPlanningAdditiveNoteBodySchema,
  guidedSprintPlanningCandidateDecisionBodySchema,
  guidedSprintPlanningCandidateSyncBodySchema,
  guidedSprintPlanningCloseBodySchema,
  guidedSprintPlanningCurrentQuerySchema,
  guidedSprintPlanningProjectParamsSchema,
  guidedSprintPlanningRecentQuerySchema,
  guidedSprintPlanningSessionHeaderBodySchema,
  guidedSprintPlanningSprintParamsSchema,
  guidedSprintPlanningTranscriptAfterCloseBodySchema,
  guidedSprintPlanningWorkItemParamsSchema,
} from "../validation/guided-sprint-planning-http.schemas.js"

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
  if (err instanceof GuidedSprintPlanningForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedSprintPlanningNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedSprintPlanningConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedSprintPlanningUnsupportedError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedSprintPlanningCommitApplyError) {
    res.status(409).json({
      error: err.code,
      message: err.message,
      failedWorkItemPublicId: err.failedWorkItemPublicId,
    })
    return
  }
  if (err instanceof GuidedSprintPlanningValidationError) {
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

function sessionJson(s: import("../domain/guided-sprint-planning-session.js").GuidedSprintPlanningSessionState) {
  return {
    ...s,
    transcriptAfterClose: s.transcriptAfterClose
      ? {
          text: s.transcriptAfterClose.text,
          updatedAt: s.transcriptAfterClose.updatedAt.toISOString(),
          updatedByUserPublicId: s.transcriptAfterClose.updatedByUserPublicId,
        }
      : null,
    startedAt: s.startedAt?.toISOString() ?? null,
    closedAt: s.closedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function candidateJson(
  i: import("../domain/guided-sprint-planning-candidate-item.js").GuidedSprintPlanningCandidateItemState,
) {
  return {
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }
}

function baselineJson(b: import("../domain/guided-sprint-planning-baseline.js").GuidedSprintPlanningBaselineState) {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
  }
}

/**
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-sprint-planning`
 */
export function createGuidedSprintPlanningRouter(
  service: GuidedSprintPlanningService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/current", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getCurrentBootstrap(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
      )
      res.status(200).json({
        ...result,
        session: result.session ? sessionJson(result.session) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/current/session", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedSprintPlanningSessionHeaderBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.upsertSessionHeader(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
        body.data,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/current/candidate-items", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.listCandidateItems(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
      )
      res.status(200).json({
        session: result.session ? sessionJson(result.session) : null,
        items: result.items.map(candidateJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/current/candidate-items/sync", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedSprintPlanningCandidateSyncBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.syncCandidateItems(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
        body.data.mode ?? "ready_from_refinement",
      )
      res.status(200).json({
        session: sessionJson(result.session),
        items: result.items.map(candidateJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/current/candidate-items/:workItemPublicId", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getCandidateDecision(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
        query.data,
      )
      res.status(200).json({
        session: result.session ? sessionJson(result.session) : null,
        item: result.item ? candidateJson(result.item) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/current/candidate-items/:workItemPublicId", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningWorkItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedSprintPlanningCandidateDecisionBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const item = await service.upsertCandidateDecision(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.workItemPublicId,
        query.data,
        body.data,
      )
      res.status(200).json({ item: candidateJson(item) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/current/close", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedSprintPlanningCloseBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.closeCurrent(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
        body.data,
      )
      res.status(200).json({
        session: sessionJson(result.session),
        baseline: result.baseline ? baselineJson(result.baseline) : null,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/current/additive-note", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedSprintPlanningAdditiveNoteBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.appendAdditiveNoteAfterClose(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
        body.data.note,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/current/transcript-after-close", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningCurrentQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedSprintPlanningTranscriptAfterCloseBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const session = await service.upsertTranscriptAfterClose(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        query.data,
        body.data.transcript,
      )
      res.status(200).json({ session: sessionJson(session) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/recent", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedSprintPlanningRecentQuerySchema.safeParse(req.query)
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

  router.get("/sprints/:sprintPublicId/baseline", async (req, res, next) => {
    try {
      const params = guidedSprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const baseline = await service.getBaselineForSprint(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.sprintPublicId,
      )
      res.status(200).json({ baseline: baseline ? baselineJson(baseline) : null })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}
