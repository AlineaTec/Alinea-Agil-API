import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformTenantForbiddenError } from "../../platform-tenants/domain/platform-tenant.errors.js"
import type { PlatformBillingOperationsService } from "../services/platform-billing-operations.service.js"
import { PlatformBillingOperationsNotFoundError } from "../services/platform-billing-operations.service.js"
import {
  platformBillingWorkspaceIdParamsSchema,
  platformBillingWorkspacesListQuerySchema,
} from "../validation/platform-billing-operations-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformBillingOperationsRouter(service: PlatformBillingOperationsService): Router {
  const r = Router()

  r.get("/billing/workspaces", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformBillingWorkspacesListQuerySchema.parse(req.query)
      const out = await service.listWorkspaces(session, q)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.get("/billing/workspaces/:workspacePublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { workspacePublicId } = platformBillingWorkspaceIdParamsSchema.parse(req.params)
      const detail = await service.getWorkspaceDetail(session, workspacePublicId)
      res.json(detail)
    } catch (e) {
      next(e)
    }
  })

  r.post("/billing/workspaces/:workspacePublicId/reconcile", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { workspacePublicId } = platformBillingWorkspaceIdParamsSchema.parse(req.params)
      const result = await service.reconcileWorkspaceNow(session, workspacePublicId)
      res.json({ ok: true, result })
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformBillingOperationsNotFoundError) {
      res.status(404).json({
        error: err.code,
        message: "No existe snapshot de billing para ese workspace (no materializado aún).",
      })
      return
    }
    if (err instanceof PlatformTenantForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
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
