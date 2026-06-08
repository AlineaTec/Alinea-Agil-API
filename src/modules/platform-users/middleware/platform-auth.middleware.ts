import type { NextFunction, Request, Response } from "express"
import type { PlatformAuthService } from "../services/platform-auth.service.js"
import type { PlatformSessionContext } from "../domain/platform-session.context.js"

declare global {
  namespace Express {
    interface Locals {
      platformSession?: PlatformSessionContext
    }
  }
}

export function platformAuthMiddleware(platformAuth: PlatformAuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const r = await platformAuth.resolveFromAuthorizationHeader(req.headers.authorization)
    if (!r.ok) {
      res.status(401).json({
        error: "platform_auth_required",
        message: "Se requiere sesión de plataforma (Bearer distinto al cliente).",
      })
      return
    }
    if (r.user.status === "inactive") {
      res.status(403).json({
        error: "platform_user_inactive",
        message: "Usuario de plataforma desactivado.",
      })
      return
    }
    res.locals.platformSession = {
      platformUserId: r.user.platformUserId,
      email: r.user.email,
      role: r.user.role,
      sessionPublicId: r.session.sessionPublicId,
    }
    next()
  }
}
