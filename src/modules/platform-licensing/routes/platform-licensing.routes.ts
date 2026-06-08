import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  PlatformLicensingForbiddenError,
  PlatformLicensingNotFoundError,
} from "../domain/platform-licensing.errors.js"
import type { PlatformLicensingService } from "../services/platform-licensing.service.js"
import {
  platformTenantIdParamsSchema,
  workspacePublicIdParamsSchema,
} from "../validation/platform-licensing-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformLicensingRouter(service: PlatformLicensingService): Router {
  const r = Router()

  r.get(
    "/licensing/tenants/by-workspace/:workspacePublicId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = sessionOrThrow(res)
        const { workspacePublicId } = workspacePublicIdParamsSchema.parse(req.params)
        const out = await service.getByWorkspacePublicId(session, workspacePublicId)
        res.json(out)
      } catch (e) {
        next(e)
      }
    },
  )

  r.get("/licensing/tenants/:platformTenantId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformTenantId } = platformTenantIdParamsSchema.parse(req.params)
      const out = await service.getByPlatformTenantId(session, platformTenantId)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformLicensingForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformLicensingNotFoundError) {
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
