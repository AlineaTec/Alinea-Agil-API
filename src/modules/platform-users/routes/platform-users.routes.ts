import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../domain/platform-session.context.js"
import {
  PlatformUserConflictError,
  PlatformUserForbiddenError,
  PlatformUserInvariantError,
} from "../domain/platform-user.errors.js"
import type { PlatformUsersService } from "../services/platform-users.service.js"
import {
  platformChangeRoleBodySchema,
  platformInviteBodySchema,
  platformMePatchBodySchema,
  platformMfaCompleteBodySchema,
  platformMfaStartBodySchema,
  platformUserIdParamsSchema,
} from "../validation/platform-users-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) {
    throw new Error("platform_session_missing")
  }
  return s
}

export function createPlatformUsersRouter(service: PlatformUsersService): Router {
  const r = Router()

  r.get("/me", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const me = await service.getMe(session)
      res.json(me)
    } catch (e) {
      next(e)
    }
  })

  r.patch("/me", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const body = platformMePatchBodySchema.parse(req.body)
      const me = await service.patchMe(session, body)
      res.json(me)
    } catch (e) {
      next(e)
    }
  })

  r.get("/users", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const list = await service.list(session)
      res.json({ items: list })
    } catch (e) {
      next(e)
    }
  })

  r.post("/users", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const body = platformInviteBodySchema.parse(req.body)
      const out = await service.invite(session, body)
      res.status(201).json(out)
    } catch (e) {
      next(e)
    }
  })

  r.patch("/users/:platformUserId/deactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
      const u = await service.deactivate(session, platformUserId)
      res.json(u)
    } catch (e) {
      next(e)
    }
  })

  r.patch("/users/:platformUserId/activate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
      const u = await service.activate(session, platformUserId)
      res.json(u)
    } catch (e) {
      next(e)
    }
  })

  r.patch("/users/:platformUserId/role", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
      const body = platformChangeRoleBodySchema.parse(req.body)
      const u = await service.changeRole(session, platformUserId, body.role)
      res.json(u)
    } catch (e) {
      next(e)
    }
  })

  /** Inicio MFA con sesión (p. ej. `platform_super_admin` configurando otro usuario). */
  r.post("/users/:platformUserId/mfa/enrollment/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
      const body = platformMfaStartBodySchema.parse(req.body ?? {})
      const out = await service.startMfaEnrollment({
        session,
        platformUserId,
        invitationNonce: body.invitationNonce,
      })
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.post("/users/:platformUserId/mfa/enrollment/complete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
      const body = platformMfaCompleteBodySchema.parse(req.body)
      const out = await service.completeMfaEnrollment({
        platformUserId,
        invitationNonce: body.invitationNonce,
        code: body.code,
        session,
      })
      res.json(out)
    } catch (e) {
      next(e)
    }
  })

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformUserForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformUserConflictError) {
      res.status(409).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformUserInvariantError) {
      const st = err.code === "NOT_FOUND" ? 404 : 400
      res.status(st).json({ error: err.code, message: err.message })
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
