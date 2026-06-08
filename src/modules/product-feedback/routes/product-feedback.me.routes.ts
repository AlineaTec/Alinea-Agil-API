import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { requireBearerAuth } from "../../login-session/middleware/require-bearer-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { isProductFeedbackServiceError, ProductFeedbackService } from "../services/product-feedback.service.js"
import {
  productFeedbackEligibilityQuerySchema,
  submitProductFeedbackBodySchema,
} from "../validation/product-feedback-http.schemas.js"

function respondPfError(err: unknown, res: Response, next: NextFunction): void {
  if (isProductFeedbackServiceError(err)) {
    res.status(err.httpStatus).json({
      error: err.code,
      message: err.message,
    })
    return
  }
  next(err)
}

function loadActorForWorkspace(
  workspaceUserService: WorkspaceUserService,
  workspacePublicId: string,
  res: Response,
): Promise<Response | undefined> {
  const ctx = res.locals.authContext
  if (!ctx) {
    return Promise.resolve(res.status(500).json({ error: "internal_error", message: "Missing auth context." }))
  }
  return workspaceUserService
    .findActorMember(workspacePublicId, ctx.user.userPublicId)
    .then((actor) => {
      if (!actor) {
        return res.status(403).json({
          error: "forbidden",
          code: "not_workspace_member",
          message: "Authenticated user is not a member of this workspace.",
        })
      }
      res.locals.workspaceUsersActor = actor
      return undefined
    })
}

/**
 * `POST /v1/me/product-feedback` y `GET /v1/me/product-feedback/eligibility`
 */
export function createProductFeedbackMeRouter(
  service: ProductFeedbackService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const r = Router()
  r.use(requireBearerAuth(authBearerService))

  r.get("/eligibility", async (req, res, next) => {
    try {
      const q = productFeedbackEligibilityQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Query inválida.",
          details: q.error.flatten(),
        })
        return
      }
      const aborted = await loadActorForWorkspace(workspaceUserService, q.data.workspacePublicId, res)
      if (aborted) return
      const actor = res.locals.workspaceUsersActor!
      const out = await service.getEligibility(actor, q.data.workspacePublicId, q.data.ideaPublicId)
      res.json({ ok: true, ...out })
    } catch (e) {
      respondPfError(e, res, next)
    }
  })

  r.post("/", billingPrimaryProductMutationGate, async (req, res, next) => {
    try {
      const parsed = submitProductFeedbackBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: parsed.error.flatten(),
        })
        return
      }
      const aborted = await loadActorForWorkspace(workspaceUserService, parsed.data.workspacePublicId, res)
      if (aborted) return
      const actor = res.locals.workspaceUsersActor!
      const out = await service.submit({ actor, parsed: parsed.data })
      res.status(201).json({ ok: true, submissionPublicId: out.submissionPublicId })
    } catch (e) {
      respondPfError(e, res, next)
    }
  })

  return r
}
