import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  isProductFeedbackServiceError,
  ProductFeedbackService,
} from "../services/product-feedback.service.js"
import {
  listProductFeedbackQuerySchema,
  patchProductFeedbackBodySchema,
  submissionPublicIdParamsSchema,
} from "../validation/product-feedback-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) throw new Error("platform_session_missing")
  return s
}

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

export function createProductFeedbackPlatformRouter(service: ProductFeedbackService): Router {
  const r = Router()

  r.get("/product-feedback", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const q = listProductFeedbackQuerySchema.parse(req.query)
      const out = await service.listAdmin(session, {
        submissionType: q.submissionType,
        status: q.status,
        workspacePublicId: q.workspacePublicId,
        moduleKey: q.moduleKey,
        projectPublicId: q.projectPublicId,
        ideaPublicId: q.ideaPublicId,
        misroutingCategory: q.misroutingCategory,
        textSearch: q.q,
        fromInclusive: q.createdFrom,
        toInclusive: q.createdTo,
        limit: q.limit,
        offset: q.offset,
      })
      res.json({ ok: true, total: out.total, items: out.items })
    } catch (e) {
      respondPfError(e, res, next)
    }
  })

  r.get("/product-feedback/:submissionPublicId", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const { submissionPublicId } = submissionPublicIdParamsSchema.parse(req.params)
      const detail = await service.getAdminDetail(session, submissionPublicId)
      res.json({ ok: true, submission: detail })
    } catch (e) {
      respondPfError(e, res, next)
    }
  })

  r.patch("/product-feedback/:submissionPublicId", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const { submissionPublicId } = submissionPublicIdParamsSchema.parse(req.params)
      const parsed = patchProductFeedbackBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: parsed.error.flatten(),
        })
        return
      }
      const updated = await service.patchAdmin(session, submissionPublicId, parsed.data)
      res.json({ ok: true, submission: updated })
    } catch (e) {
      respondPfError(e, res, next)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error && err.message === "platform_session_missing") {
      res.status(500).json({ error: "internal_error", message: err.message })
      return
    }
    respondPfError(err, res, next)
  })

  return r
}
