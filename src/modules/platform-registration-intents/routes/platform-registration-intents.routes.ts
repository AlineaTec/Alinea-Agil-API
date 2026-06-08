import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  PlatformIdentityRegistrationIntentsDeletionBlockedError,
  PlatformIdentityRegistrationIntentsMutationForbiddenError,
  PlatformIdentityRegistrationIntentsReadForbiddenError,
} from "../domain/platform-registration-intents.errors.js"
import type { PlatformIdentityRegistrationIntentsAdminService } from "../services/platform-registration-intents-admin.service.js"
import {
  deleteIdentityRegistrationIntentsBodySchema,
  platformIdentityRegistrationIntentListQuerySchema,
  purgeUnprovisionedBodySchema,
} from "../validation/platform-registration-intents-http.schemas.js"
import { ZodError } from "zod"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformIdentityRegistrationIntentsRouter(
  service: PlatformIdentityRegistrationIntentsAdminService,
): Router {
  const r = Router()

  r.get("/registration/intents", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const q = platformIdentityRegistrationIntentListQuerySchema.parse(req.query)
      const out = await service.listIdentityRegistrationIntents(session, {
        limit: q.limit,
        offset: q.offset,
        q: q.q,
        status: q.status,
      })
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.post("/registration/intents/delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const body = deleteIdentityRegistrationIntentsBodySchema.parse(req.body ?? {})
      const out = await service.deleteIdentityRegistrationIntentsByPublicIds(session, {
        intentPublicIds: body.intentPublicIds,
        forceIncludingProvisioned: body.forceIncludingProvisioned,
      })
      res.status(200).json(out)
    } catch (e) {
      next(e)
    }
  })

  r.post(
    "/registration/intents/purge-non-provisioned",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = sessionOrThrow(res)
        purgeUnprovisionedBodySchema.parse(req.body ?? {})
        const out = await service.purgeIdentityRegistrationIntentsWithoutProvisionedWorkspace(session)
        res.status(200).json(out)
      } catch (e) {
        next(e)
      }
    },
  )

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformIdentityRegistrationIntentsReadForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformIdentityRegistrationIntentsMutationForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformIdentityRegistrationIntentsDeletionBlockedError) {
      res.status(409).json({
        error: err.code,
        message: err.message,
        blockedIntentPublicIds: err.blockedIntentPublicIds,
      })
      return
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "invalid_request",
        message: "Cuerpo o parámetros no válidos.",
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
