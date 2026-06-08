import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  PlatformTenantForbiddenError,
  PlatformTenantNotFoundError,
  PlatformTenantValidationError,
} from "../domain/platform-tenant.errors.js"
import type { PlatformTenantsService } from "../services/platform-tenants.service.js"
import {
  platformTenantIdParamsSchema,
  platformTenantListQuerySchema,
  platformTenantPatchStatusSchema,
  workspacePublicIdParamsSchema,
} from "../validation/platform-tenants-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformTenantsRouter(service: PlatformTenantsService): Router {
  const r = Router()

  r.get("/tenants", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformTenantListQuerySchema.parse(req.query)
      const out = await service.list(session, { q: q.q, limit: q.limit, offset: q.offset })
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.get("/tenants/by-workspace/:workspacePublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { workspacePublicId } = workspacePublicIdParamsSchema.parse(req.params)
      const detail = await service.getByWorkspacePublicId(session, workspacePublicId)
      res.json(detail)
    } catch (e) {
      next(e)
    }
  })

  r.get("/tenants/:platformTenantId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformTenantId } = platformTenantIdParamsSchema.parse(req.params)
      const detail = await service.getByPlatformTenantId(session, platformTenantId)
      res.json(detail)
    } catch (e) {
      next(e)
    }
  })

  r.patch("/tenants/:platformTenantId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformTenantId } = platformTenantIdParamsSchema.parse(req.params)
      const body = platformTenantPatchStatusSchema.parse(req.body)
      const detail = await service.patchStatus(session, platformTenantId, body.status)
      res.json(detail)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformTenantForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformTenantNotFoundError) {
      res.status(404).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformTenantValidationError) {
      res.status(400).json({ error: err.code, message: err.message })
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
