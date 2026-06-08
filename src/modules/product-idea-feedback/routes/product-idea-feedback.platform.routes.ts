import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  isProductIdeaFeedbackEntryError,
  ProductIdeaFeedbackEntryService,
} from "../services/product-idea-feedback.service.js"
import {
  createProductIdeaBodySchema,
  feedbackPublicIdParamsSchema,
  listProductIdeaFeedbackEntryQuerySchema,
  listProductIdeasQuerySchema,
  patchProductIdeaBodySchema,
  patchProductIdeaFeedbackEntryBodySchema,
  productIdeaIdParamsSchema,
} from "../validation/product-idea-feedback-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) throw new Error("platform_session_missing")
  return s
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

/**
 * Rutas plataforma (`/v1/platform/...`): equivalente funcional a **admin** en contracts.
 */
export function createProductIdeaFeedbackEntryPlatformRouter(service: ProductIdeaFeedbackEntryService): Router {
  const r = Router()

  r.get("/product-idea-feedback", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const q = listProductIdeaFeedbackEntryQuerySchema.parse(req.query)
      const out = await service.listAdmin(session, {
        reviewStatus: q.reviewStatus,
        ideaPublicId: q.ideaPublicId,
        workspacePublicId: q.workspacePublicId,
        fromInclusive: q.from,
        toInclusive: q.to,
        limit: q.limit,
        offset: q.offset,
      })
      res.json({ ok: true, total: out.total, items: out.items })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.get("/product-idea-feedback/:feedbackPublicId", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const { feedbackPublicId } = feedbackPublicIdParamsSchema.parse(req.params)
      const detail = await service.getAdminDetail(session, feedbackPublicId)
      res.json({ ok: true, feedback: detail })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.patch("/product-idea-feedback/:feedbackPublicId", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const { feedbackPublicId } = feedbackPublicIdParamsSchema.parse(req.params)
      const body = patchProductIdeaFeedbackEntryBodySchema.parse(req.body)
      const updated = await service.patchAdmin(session, feedbackPublicId, body)
      res.json({ ok: true, feedback: updated })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.get("/product-ideas", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const q = listProductIdeasQuerySchema.parse(req.query)
      const out = await service.listIdeasForPlatform(session, {
        status: q.status,
        limit: q.limit,
        offset: q.offset,
      })
      res.json({ ok: true, total: out.total, items: out.items })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.post("/product-ideas", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const parsed = createProductIdeaBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = parsed.data
      const idea = await service.createIdeaForPlatform(session, {
        title: body.title,
        summary: body.summary,
        description: body.description === undefined ? null : body.description,
        area: body.area,
        status: body.status,
        isFeedbackEnabled: body.isFeedbackEnabled,
      })
      res.status(201).json({ ok: true, idea })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.get("/product-ideas/:ideaPublicId", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const { ideaPublicId } = productIdeaIdParamsSchema.parse(req.params)
      const idea = await service.getIdeaForPlatform(session, ideaPublicId)
      if (!idea) {
        res.status(404).json({ error: "not_found", message: "Idea no encontrada." })
        return
      }
      res.json({ ok: true, idea })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.patch("/product-ideas/:ideaPublicId", async (req, res, next) => {
    try {
      const session = sessionOrThrow(res)
      const { ideaPublicId } = productIdeaIdParamsSchema.parse(req.params)
      const parsed = patchProductIdeaBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = parsed.data
      const idea = await service.patchIdeaForPlatform(session, ideaPublicId, {
        title: body.title,
        summary: body.summary,
        description: body.description,
        area: body.area,
        status: body.status,
        isFeedbackEnabled: body.isFeedbackEnabled,
      })
      res.json({ ok: true, idea })
    } catch (e) {
      respondPifError(e, res, next)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error && err.message === "platform_session_missing") {
      res.status(500).json({ error: "internal_error", message: err.message })
      return
    }
    respondPifError(err, res, next)
  })

  return r
}
