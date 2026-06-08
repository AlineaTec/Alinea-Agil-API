import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  PlatformObservabilityForbiddenError,
  PlatformObservabilityNotFoundError,
} from "../domain/platform-observability.errors.js"
import type { PlatformObservabilityService } from "../services/platform-observability.service.js"
import {
  platformObservabilityTenantListQuerySchema,
  platformTenantIdParamsSchema,
} from "../validation/platform-observability-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformObservabilityRouter(service: PlatformObservabilityService): Router {
  const r = Router()

  r.get("/observability/summary", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const out = await service.getGlobalSummary(session)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.get("/observability/tenants", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformObservabilityTenantListQuerySchema.parse(req.query)
      const out = await service.listTenantHealth(session, {
        q: q.q,
        limit: q.limit,
        offset: q.offset,
        attentionOnly: q.attentionOnly ?? false,
      })
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.get("/observability/tenants/:platformTenantId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformTenantId } = platformTenantIdParamsSchema.parse(req.params)
      const out = await service.getTenantHealth(session, platformTenantId)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformObservabilityForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformObservabilityNotFoundError) {
      res.status(404).json({ error: err.code, message: err.message })
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
