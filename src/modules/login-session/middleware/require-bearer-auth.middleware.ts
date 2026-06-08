import type { RequestHandler } from "express"
import type { AuthBearerService } from "../services/auth-bearer.service.js"

const UNAUTHORIZED_BODY = {
  ok: false,
  error: "unauthorized" as const,
}

/**
 * Middleware para rutas protegidas: exige Bearer válido y deja contexto en `res.locals.authContext`.
 */
export function requireBearerAuth(
  authBearerService: AuthBearerService,
): RequestHandler {
  return async (req, res, next) => {
    const r =
      await authBearerService.resolveFromAuthorizationHeader(
        req.headers.authorization,
      )
    if (!r.ok) {
      res.status(401).json({
        ...UNAUTHORIZED_BODY,
        reason: r.reason,
      })
      return
    }
    res.locals.authContext = { session: r.session, user: r.user }
    next()
  }
}
