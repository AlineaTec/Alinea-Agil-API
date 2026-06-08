import { Router, type NextFunction, type Request, type Response } from "express"
import {
  createPasswordResetConfirmRateLimiter,
  createPasswordResetRequestRateLimiter,
  createPlatformAuthLoginRateLimiter,
} from "../../../http-rate-limit.js"
import type { PlatformAuthService } from "../services/platform-auth.service.js"
import type { PlatformPasswordResetService } from "../services/platform-password-reset.service.js"
import type { PlatformUsersService } from "../services/platform-users.service.js"
import {
  PlatformUserConflictError,
  PlatformUserForbiddenError,
  PlatformUserInvariantError,
} from "../domain/platform-user.errors.js"
import { getRequestClientIp, getRequestUserAgent } from "../http/request-client-context.js"
import { ensureTurnstileForRequest } from "../../../infra/turnstile/ensure-turnstile-for-request.js"
import {
  platformLoginBodySchema,
  platformMfaCompleteBodySchema,
  platformMfaStartBodySchema,
  platformPasswordResetConfirmBodySchema,
  platformPasswordResetRequestBodySchema,
  platformSetPasswordBodySchema,
  platformUserIdParamsSchema,
} from "../validation/platform-users-http.schemas.js"

export function createPlatformAuthPublicRouter(deps: {
  platformAuth: PlatformAuthService
  platformUsers: PlatformUsersService
  platformPasswordReset: PlatformPasswordResetService
}): Router {
  const r = Router()
  const platformLoginRateLimit = createPlatformAuthLoginRateLimiter()
  const passwordResetRequestRateLimit = createPasswordResetRequestRateLimiter()
  const passwordResetConfirmRateLimit = createPasswordResetConfirmRateLimiter()

  r.post("/login", platformLoginRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = platformLoginBodySchema.parse(req.body)
      const turnstileOk = await ensureTurnstileForRequest(req, res, body.turnstileToken)
      if (!turnstileOk) return
      const result = await deps.platformAuth.login(body.email, body.password, body.totpCode, {
        clientIp: getRequestClientIp(req),
        userAgent: getRequestUserAgent(req),
      })
      if (!result.ok) {
        const status =
          result.reason === "mfa_required"
            ? 401
            : result.reason === "locked"
              ? 423
              : result.reason === "inactive"
                ? 403
                : 401
        res.status(status).json({
          error: `platform_login_${result.reason}`,
          message:
            result.reason === "mfa_required"
              ? "Se requiere código TOTP."
              : result.reason === "locked"
                ? "Cuenta bloqueada por intentos MFA."
                : "Credenciales inválidas o usuario inactivo.",
        })
        return
      }
      res.status(200).json({
        accessToken: result.accessToken,
        expiresAt: result.expiresAt.toISOString(),
        user: {
          platformUserId: result.user.platformUserId,
          email: result.user.email,
          displayName: result.user.displayName,
          role: result.user.role,
          status: result.user.status,
          mfaStatus: result.user.mfaStatus,
        },
      })
    } catch (e) {
      next(e)
    }
  })

  r.post("/set-initial-password", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = platformSetPasswordBodySchema.parse(req.body)
      const u = await deps.platformUsers.setInitialPassword(body)
      res.status(200).json({
        platformUserId: u.platformUserId,
        email: u.email,
        status: u.status,
        mfaStatus: u.mfaStatus,
      })
    } catch (e) {
      if (e instanceof PlatformUserInvariantError) {
        res.status(400).json({ error: e.code, message: e.message })
        return
      }
      if (e instanceof PlatformUserConflictError) {
        res.status(409).json({ error: e.code, message: e.message })
        return
      }
      if (e instanceof PlatformUserForbiddenError) {
        res.status(403).json({ error: e.code, message: e.message })
        return
      }
      next(e)
    }
  })

  r.post(
    "/password-reset/request",
    passwordResetRequestRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = platformPasswordResetRequestBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message: 'Se espera JSON { "email": string } con email válido.',
            details: parsed.error.flatten(),
          })
          return
        }

        await deps.platformPasswordReset.requestResetForEmail(parsed.data.email)
        res.status(200).json({ ok: true })
      } catch (e) {
        next(e)
      }
    },
  )

  r.post(
    "/password-reset/confirm",
    passwordResetConfirmRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = platformPasswordResetConfirmBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "token": string, "newPassword": string } (contraseña 10–128 caracteres).',
            details: parsed.error.flatten(),
          })
          return
        }

        const outcome = await deps.platformPasswordReset.confirmWithToken(
          parsed.data.token,
          parsed.data.newPassword,
        )

        if (outcome.ok) {
          res.status(200).json({ ok: true })
          return
        }

        if (outcome.code === "invalid_new_password") {
          res.status(400).json({
            error: "invalid_new_password",
            message: "La contraseña debe tener entre 10 y 128 caracteres.",
          })
          return
        }

        res.status(400).json({
          error: "invalid_or_expired_token",
          message: "El enlace no es válido o ha caducado. Solicita uno nuevo.",
        })
      } catch (e) {
        next(e)
      }
    },
  )

  r.post(
    "/users/:platformUserId/mfa/enrollment/start",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
        const body = platformMfaStartBodySchema.parse(req.body ?? {})
        const out = await deps.platformUsers.startMfaEnrollment({
          platformUserId,
          invitationNonce: body.invitationNonce,
        })
        res.json(out)
      } catch (e) {
        next(e)
      }
    },
  )

  r.post(
    "/users/:platformUserId/mfa/enrollment/complete",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { platformUserId } = platformUserIdParamsSchema.parse(req.params)
        const body = platformMfaCompleteBodySchema.parse(req.body)
        const out = await deps.platformUsers.completeMfaEnrollment({
          platformUserId,
          invitationNonce: body.invitationNonce,
          code: body.code,
        })
        res.json(out)
      } catch (e) {
        next(e)
      }
    },
  )

  r.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deps.platformAuth.logoutByAuthorizationHeader(req.headers.authorization)
      res.status(204).send()
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
    next(err)
  })

  return r
}
