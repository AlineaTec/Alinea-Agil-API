import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformTenantForbiddenError } from "../../platform-tenants/domain/platform-tenant.errors.js"
import { PlatformBillingNotFoundError } from "../domain/platform-billing.errors.js"
import type { PlatformBillingService } from "../services/platform-billing.service.js"
import {
  platformBillingTenantIdParamsSchema,
  platformBillingTenantListQuerySchema,
} from "../validation/platform-billing-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformBillingRouter(service: PlatformBillingService): Router {
  const r = Router()

  r.get("/billing/tenants", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformBillingTenantListQuerySchema.parse(req.query)
      const out = await service.listTenantCommercialRows(session, q)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.get("/billing/tenants/:platformTenantId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformTenantId } = platformBillingTenantIdParamsSchema.parse(req.params)
      const row = await service.getTenantCommercialDetail(session, platformTenantId)
      res.json(row)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformTenantForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformBillingNotFoundError) {
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
