import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { requireBearerAuth } from "../../login-session/middleware/require-bearer-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  isProductIdeaFeedbackEntryError,
  ProductIdeaFeedbackEntryService,
} from "../services/product-idea-feedback.service.js"
import {
  productIdeaFeedbackWorkspacePathParamsSchema,
  productIdeaWorkspaceOnlyPathParamsSchema,
  submitProductIdeaFeedbackEntryBodySchema,
} from "../validation/product-idea-feedback-http.schemas.js"

function loadActorWorkspace(
  workspaceUserService: WorkspaceUserService,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const params = productIdeaWorkspaceOnlyPathParamsSchema.safeParse(req.params)
    if (!params.success) {
      res.status(400).json({
        error: "invalid_request",
        message: "Parámetros de ruta inválidos.",
        details: params.error.flatten(),
      })
      return
    }
    const ctx = res.locals.authContext
    if (!ctx) {
      res.status(500).json({ error: "internal_error", message: "Missing auth context." })
      return
    }
    const actor = await workspaceUserService.findActorMember(
      params.data.workspacePublicId,
      ctx.user.userPublicId,
    )
    if (!actor) {
      res.status(403).json({
        error: "forbidden",
        code: "not_workspace_member",
        message: "Authenticated user is not a member of this workspace.",
      })
      return
    }
    res.locals.workspaceUsersActor = actor
    next()
  }
}

function loadActorWithIdea(
  workspaceUserService: WorkspaceUserService,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const params = productIdeaFeedbackWorkspacePathParamsSchema.safeParse(req.params)
    if (!params.success) {
      res.status(400).json({
        error: "invalid_request",
        message: "Parámetros de ruta inválidos.",
        details: params.error.flatten(),
      })
      return
    }
    const ctx = res.locals.authContext
    if (!ctx) {
      res.status(500).json({ error: "internal_error", message: "Missing auth context." })
      return
    }
    const actor = await workspaceUserService.findActorMember(
      params.data.workspacePublicId,
      ctx.user.userPublicId,
    )
    if (!actor) {
      res.status(403).json({
        error: "forbidden",
        code: "not_workspace_member",
        message: "Authenticated user is not a member of this workspace.",
      })
      return
    }
    res.locals.workspaceUsersActor = actor
    next()
  }
}

function respondPifError(err: unknown, res: Response, next: NextFunction): void {
  if (isProductIdeaFeedbackEntryError(err)) {
    res.status(err.httpStatus).json({
      error: err.code,
      message: err.message,
    })
    return
  }
  next(err)
}

function handle(err: unknown, res: Response, next: NextFunction): void {
  respondPifError(err, res, next)
}

/**
 * Bajo base `/v1/workspaces/:workspacePublicId/product-ideas` — `GET /` (catálogo) y
 * bajo `/:ideaPublicId` — `feedback/...` (elegibilidad y envío).
 */
export function createProductIdeaFeedbackEntryWorkspaceRouter(
  service: ProductIdeaFeedbackEntryService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const r = Router({ mergeParams: true })
  r.use(requireBearerAuth(authBearerService))
  r.use(loadActorWorkspace(workspaceUserService))
  r.use(billingPrimaryProductMutationGate)

  r.get("/", async (req, res, next) => {
    try {
      const params = productIdeaWorkspaceOnlyPathParamsSchema.parse(req.params)
      void params
      const actor = res.locals.workspaceUsersActor!
      const out = await service.listIdeasForWorkspace(actor)
      res.json({ ok: true, total: out.items.length, items: out.items })
    } catch (e) {
      handle(e, res, next)
    }
  })

  const underIdea = Router({ mergeParams: true })
  underIdea.use(requireBearerAuth(authBearerService))
  underIdea.use(loadActorWithIdea(workspaceUserService))
  underIdea.use(billingPrimaryProductMutationGate)

  underIdea.get("/feedback/eligibility", async (req, res, next) => {
    try {
      const params = productIdeaFeedbackWorkspacePathParamsSchema.parse(req.params)
      const actor = res.locals.workspaceUsersActor!
      const out = await service.getEligibility(actor, params.workspacePublicId, params.ideaPublicId)
      res.json({ ok: true, ...out })
    } catch (e) {
      handle(e, res, next)
    }
  })

  underIdea.post("/feedback", async (req, res, next) => {
    try {
      const params = productIdeaFeedbackWorkspacePathParamsSchema.parse(req.params)
      const body = submitProductIdeaFeedbackEntryBodySchema.parse(req.body)
      const actor = res.locals.workspaceUsersActor!
      const out = await service.submit({
        actor,
        workspacePublicId: params.workspacePublicId,
        ideaPublicId: params.ideaPublicId,
        reaction: body.reaction,
        likedWhat: body.likedWhat,
        couldImproveWhat: body.couldImproveWhat,
        additionalComment: body.additionalComment ?? null,
        sourceSurface: body.sourceSurface,
        projectPublicId: body.projectPublicId ?? null,
      })
      res.status(201).json({ ok: true, feedbackPublicId: out.feedbackPublicId })
    } catch (e) {
      handle(e, res, next)
    }
  })

  r.use("/:ideaPublicId", underIdea)

  return r
}
