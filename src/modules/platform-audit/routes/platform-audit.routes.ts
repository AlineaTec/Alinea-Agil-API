import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  PlatformAuditReadForbiddenError,
  PlatformAuditReadNotFoundError,
  PlatformAuditReadValidationError,
} from "../domain/platform-audit-read.errors.js"
import type { PlatformAuditReadService } from "../services/platform-audit-read.service.js"
import {
  platformAuditEventIdParamsSchema,
  platformAuditExportQuerySchema,
  platformAuditListQuerySchema,
} from "../validation/platform-audit-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformAuditRouter(service: PlatformAuditReadService): Router {
  const r = Router()

  r.get("/audit/export", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformAuditExportQuerySchema.parse(req.query)
      const { format, limit: _l, offset: _o, ...rest } = q
      const out = await service.export(session, { ...rest, format })
      res.setHeader("Content-Type", out.contentType)
      res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`)
      res.send(out.body)
    } catch (e) {
      next(e)
    }
  })

  r.get("/audit/events", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformAuditListQuerySchema.parse(req.query)
      const out = await service.list(session, q)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.get("/audit/events/:platformAuditEventId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformAuditEventId } = platformAuditEventIdParamsSchema.parse(req.params)
      const out = await service.getById(session, platformAuditEventId)
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformAuditReadForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformAuditReadNotFoundError) {
      res.status(404).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformAuditReadValidationError) {
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
