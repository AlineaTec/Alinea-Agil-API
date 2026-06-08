import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformRegistrationPaddleForbiddenError } from "../domain/platform-registration-paddle.errors.js"
import type { PlatformRegistrationPaddleReadService } from "../services/platform-registration-paddle-read.service.js"
import { platformRegistrationPaddleListQuerySchema } from "../validation/platform-registration-paddle-http.schemas.js"
import { ZodError } from "zod"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformRegistrationPaddleRouter(
  service: PlatformRegistrationPaddleReadService,
): Router {
  const r = Router()

  r.get("/registration/paddle-payments", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformRegistrationPaddleListQuerySchema.parse(req.query)
      const out = await service.listPaddlePayments(session, {
        limit: q.limit,
        offset: q.offset,
      })
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformRegistrationPaddleForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "invalid_request",
        message: "Parámetros de consulta no válidos.",
        details: err.flatten(),
      })
      return
    }
    if (err instanceof Error && err.message === "platform_session_missing") {
      res.status(500).json({ error: "internal_error", message: err.message })
      return
    }
    next(err)
  })

  return r
}
