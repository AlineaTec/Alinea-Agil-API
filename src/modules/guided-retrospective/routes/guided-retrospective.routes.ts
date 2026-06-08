import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import { ensureTurnstileForRequest } from "../../../infra/turnstile/ensure-turnstile-for-request.js"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { ProjectRuntimeForbiddenError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import { ScrumBacklogForbiddenError } from "../../project-scrum-backlog/domain/scrum-backlog.errors.js"
import {
  GuidedRetrospectiveConflictError,
  GuidedRetrospectiveForbiddenError,
  GuidedRetrospectiveNotFoundError,
  GuidedRetrospectiveUnsupportedError,
  GuidedRetrospectiveValidationError,
} from "../domain/guided-retrospective.errors.js"
import type { GuidedRetrospectiveService } from "../services/guided-retrospective.service.js"
import {
  guidedRetroAdditiveNoteBodySchema,
  guidedRetroCloseBodySchema,
  guidedRetroContributionBodySchema,
  guidedRetroContributionParamsSchema,
  guidedRetroContributionPatchBodySchema,
  guidedRetroJoinBodySchema,
  guidedRetroMergeTopicsBodySchema,
  guidedRetroProjectActionItemParamsSchema,
  guidedRetroProjectActionItemPatchBodySchema,
  guidedRetroProjectActionItemsQuerySchema,
  guidedRetroProjectParamsSchema,
  guidedRetroPublicResolveJoinBodySchema,
  guidedRetroRecentQuerySchema,
  guidedRetroSessionHeaderBodySchema,
  guidedRetroTodayQuerySchema,
  guidedRetroTopicBodySchema,
  guidedRetroTopicParamsSchema,
  guidedRetroTranscriptAfterCloseBodySchema,
  guidedRetroVoteBodySchema,
  guidedRetroWorkspaceParamsSchema,
} from "../validation/guided-retrospective-http.schemas.js"

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
  if (err instanceof GuidedRetrospectiveForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRetrospectiveNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRetrospectiveConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRetrospectiveUnsupportedError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof GuidedRetrospectiveValidationError) {
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

function sessionJson(s: import("../domain/guided-retrospective-session.js").GuidedRetrospectiveSessionState) {
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

function topicJson(t: import("../domain/guided-retrospective-topic.js").GuidedRetrospectiveTopicState) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

function contributionJson(
  c: import("../domain/guided-retrospective-contribution.js").GuidedRetrospectiveContributionState,
) {
  const author =
    c.authorUserPublicId.length > 0 ? c.authorUserPublicId : null
  return {
    ...c,
    authorUserPublicId: author,
    authorGuestLabel: c.authorGuestLabel ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function actionItemJson(
  a: import("../domain/guided-retrospective-action-item.js").GuidedRetrospectiveActionItemState,
) {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    history: a.history.map((h) => ({
      ...h,
      occurredAt: h.occurredAt.toISOString(),
    })),
  }
}

/** `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-retrospective` */
export function createGuidedRetrospectiveProjectRouter(
  service: GuidedRetrospectiveService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/today", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await service.getTodayBootstrap(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        supportLevel: result.supportLevel,
        guidedRetrospectiveOperable: result.guidedRetrospectiveOperable,
        operationalApproach: result.operationalApproach,
        operationalTimeZone: result.operationalTimeZone,
        sessionDate: result.sessionDate,
        sessionSlot: result.sessionSlot,
        session: result.session ? sessionJson(result.session) : null,
        effectiveTemplate: result.effectiveTemplate,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/session", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroSessionHeaderBodySchema.safeParse(req.body)
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

  router.get("/today/contributions", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.listContributionsForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: out.session ? sessionJson(out.session) : null,
        contributions: out.contributions.map(contributionJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/contributions", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroContributionBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const row = await service.appendContributionForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(201).json({ contribution: contributionJson(row) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.patch("/today/contributions/:contributionPublicId", async (req, res, next) => {
    try {
      const params = guidedRetroContributionParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroContributionPatchBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const row = await service.patchContributionForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.contributionPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(200).json({ contribution: contributionJson(row) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/topics", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroTopicBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const topic = await service.createTopicForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(201).json({ topic: topicJson(topic) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/topics/merge", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroMergeTopicsBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const topic = await service.mergeTopicsForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(200).json({ topic: topicJson(topic) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/topics", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.listTopicsForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: out.session ? sessionJson(out.session) : null,
        topics: out.topics.map(topicJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/topics/:topicId/vote", async (req, res, next) => {
    try {
      const params = guidedRetroTopicParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroVoteBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      await service.voteOnTopicForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.topicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
        body.data,
      )
      res.status(204).end()
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.delete("/today/topics/:topicId/vote", async (req, res, next) => {
    try {
      const params = guidedRetroTopicParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      await service.deleteVoteOnTopicForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.topicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(204).end()
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.get("/today/action-items", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.listActionItemsForToday(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        { sessionDate: query.data.sessionDate, sessionSlot: query.data.sessionSlot },
      )
      res.status(200).json({
        session: out.session ? sessionJson(out.session) : null,
        actionItems: out.actionItems.map(actionItemJson),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/today/close", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroCloseBodySchema.safeParse(req.body)
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
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroTranscriptAfterCloseBodySchema.safeParse(req.body)
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
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroTodayQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const body = guidedRetroAdditiveNoteBodySchema.safeParse(req.body)
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
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroRecentQuerySchema.safeParse(req.query)
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

  router.get("/action-items", async (req, res, next) => {
    try {
      const params = guidedRetroProjectParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const query = guidedRetroProjectActionItemsQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({ error: "invalid_query", details: query.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const rows = await service.listProjectActionItems(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        {
          status: query.data.status,
          assignee: query.data.assignee,
          ownerUserPublicId: query.data.ownerUserPublicId,
          unassigned: query.data.unassigned,
          priority: query.data.priority,
        },
      )
      res.status(200).json({
        actionItems: rows.map((r) => ({
          actionItem: actionItemJson(r.actionItem),
          retroSessionDate: r.retroSessionDate,
          retroSessionSlot: r.retroSessionSlot,
        })),
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.patch("/action-items/:actionItemPublicId", async (req, res, next) => {
    try {
      const params = guidedRetroProjectActionItemParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const body = guidedRetroProjectActionItemPatchBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const updated = await service.patchProjectActionItem(
        actor,
        params.data.workspacePublicId,
        params.data.projectPublicId,
        params.data.actionItemPublicId,
        body.data,
      )
      res.status(200).json({ actionItem: actionItemJson(updated) })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}

/** `POST /v1/workspaces/:workspacePublicId/guided-retrospective/join-by-code` */
export function createGuidedRetrospectiveJoinRouter(
  service: GuidedRetrospectiveService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.post("/join-by-code", async (req, res, next) => {
    try {
      const params = guidedRetroWorkspaceParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: "invalid_path_params", details: params.error.flatten() })
        return
      }
      const body = guidedRetroJoinBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await service.joinBySessionCode(actor, params.data.workspacePublicId, body.data.sessionCode)
      res.status(200).json({
        session: sessionJson(out.session),
        projectPublicId: out.projectPublicId,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}

/**
 * Rutas públicas bajo `/v1/public/guided-retrospective`.
 * `POST .../resolve-join-by-code` no registra participante: solo valida código + Turnstile y devuelve destino.
 * `POST .../room-state` devuelve plantilla, aportaciones y temas (lectura pública acotada al código).
 * `POST .../contributions` crea un aporte de invitado (apodo opcional o anónimo).
 */
export function createGuidedRetrospectivePublicJoinRouter(
  service: GuidedRetrospectiveService,
  rateLimitMiddleware: RequestHandler,
): Router {
  const router = Router()
  router.use(rateLimitMiddleware)

  router.post("/resolve-join-by-code", async (req, res, next) => {
    try {
      const parsed = guidedRetroPublicResolveJoinBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() })
        return
      }
      const turnstileOk = await ensureTurnstileForRequest(req, res, parsed.data.turnstileToken)
      if (!turnstileOk) return

      const out = await service.resolveJoinTargetBySessionCode(parsed.data.sessionCode)
      res.status(200).json({
        session: sessionJson(out.session),
        projectPublicId: out.projectPublicId,
        workspacePublicId: out.workspacePublicId,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.post("/room-state", async (req, res, next) => {
    try {
      const parsed = guidedRetroPublicResolveJoinBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() })
        return
      }
      const turnstileOk = await ensureTurnstileForRequest(req, res, parsed.data.turnstileToken)
      if (!turnstileOk) return

      const out = await service.getPublicRoomStateBySessionCode(parsed.data.sessionCode)
      res.status(200).json({
        supportLevel: out.supportLevel,
        guidedRetrospectiveOperable: out.guidedRetrospectiveOperable,
        operationalApproach: out.operationalApproach,
        operationalTimeZone: out.operationalTimeZone,
        sessionDate: out.sessionDate,
        sessionSlot: out.sessionSlot,
        session: sessionJson(out.session),
        effectiveTemplate: out.effectiveTemplate,
        contributions: out.contributions.map(contributionJson),
        topics: out.topics.map(topicJson),
        workspacePublicId: out.workspacePublicId,
        projectPublicId: out.projectPublicId,
      })
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  return router
}
