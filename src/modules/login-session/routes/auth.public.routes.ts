import { Router, type Request, type Response, type NextFunction } from "express"
import {
  createPasswordResetConfirmRateLimiter,
  createPasswordResetRequestRateLimiter,
  createWorkspaceAuthLoginRateLimiter,
} from "../../../http-rate-limit.js"
import { ensureTurnstileForRequest } from "../../../infra/turnstile/ensure-turnstile-for-request.js"
import type { AuthMeResolutionService } from "../../workspace-users/services/auth-me-resolution.service.js"
import { requireBearerAuth } from "../middleware/require-bearer-auth.middleware.js"
import type { AuthBearerService } from "../services/auth-bearer.service.js"
import type { LoginFlowService } from "../services/login-flow.service.js"
import type { PasswordResetService } from "../services/password-reset.service.js"
import type { ProfileUpdateService } from "../services/profile-update.service.js"
import {
  loginEmailPasswordBodySchema,
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
  postAuthActiveWorkspaceBodySchema,
} from "../validation/login.schemas.js"
import { patchAuthProfileBodySchema } from "../validation/profile.schemas.js"

export type AuthPublicRouterDeps = {
  loginFlowService: LoginFlowService
  authBearerService: AuthBearerService
  profileUpdateService: ProfileUpdateService
  passwordResetService: PasswordResetService
  authMeResolution: AuthMeResolutionService
}

/**
 * Rutas bajo `/v1/auth`.
 * - `POST /login` (OP-L1): cuerpo `{ "email", "password" }`.
 * - `GET /me`: Bearer; perfil + `workspaces`, `workspace` (activo resuelto), `workspaceAccess`.
 * - `POST /me/active-workspace`: Bearer; `{ "workspacePublicId": uuid }` para persistir preferencia válida.
 * - `POST /logout`: Bearer opcional; revoca la sesión actual si el token es válido (respuesta siempre 200 para el cliente).
 * - `PATCH /profile`: Bearer; actualizar `fullName` y/o contraseña (`currentPassword` + `newPassword`).
 * - `POST /password-reset/request`: cuerpo `{ "email": string }`; **200** `{ ok: true }` siempre ante email válido.
 * - `POST /password-reset/confirm`: cuerpo `{ "token": string, "newPassword": string }`.
 */
export function createAuthPublicRouter(deps: AuthPublicRouterDeps): Router {
  const {
    loginFlowService,
    authBearerService,
    profileUpdateService,
    passwordResetService,
    authMeResolution,
  } = deps

  const router = Router()
  const workspaceLoginRateLimit = createWorkspaceAuthLoginRateLimiter()
  const passwordResetRequestRateLimit = createPasswordResetRequestRateLimiter()
  const passwordResetConfirmRateLimit = createPasswordResetConfirmRateLimiter()

  router.post(
    "/login",
    workspaceLoginRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = loginEmailPasswordBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "email": string, "password": string, "turnstileToken"?: string } con email válido.',
            details: parsed.error.flatten(),
          })
          return
        }

        const turnstileOk = await ensureTurnstileForRequest(
          req,
          res,
          parsed.data.turnstileToken,
        )
        if (!turnstileOk) return

        const result = await loginFlowService.executeEmailPasswordLogin(
          parsed.data.email,
          parsed.data.password,
        )

        if (!result.ok) {
          res.status(401).json({
            ok: false,
            reason: result.reason,
          })
          return
        }

        res.status(200).json({
          ok: true,
          accessToken: result.opaqueAccessToken,
          session: {
            sessionPublicId: result.session.sessionPublicId,
            userPublicId: result.session.userPublicId,
            createdAt: result.session.createdAt,
            expiresAt: result.session.expiresAt,
          },
        })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/password-reset/request",
    passwordResetRequestRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = passwordResetRequestBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message: 'Se espera JSON { "email": string } con email válido.',
            details: parsed.error.flatten(),
          })
          return
        }

        await passwordResetService.requestResetForEmail(parsed.data.email)
        res.status(200).json({ ok: true })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/password-reset/confirm",
    passwordResetConfirmRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = passwordResetConfirmBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message:
              'Se espera JSON { "token": string, "newPassword": string } (contraseña 8–128 caracteres).',
            details: parsed.error.flatten(),
          })
          return
        }

        const outcome = await passwordResetService.confirmWithToken(
          parsed.data.token,
          parsed.data.newPassword,
        )

        if (outcome.ok) {
          res.status(200).json({ ok: true })
          return
        }

        if (outcome.code === "invalid_new_password") {
          res.status(400).json({
            ok: false,
            error: "invalid_request",
            code: outcome.code,
            message: "La contraseña debe tener entre 8 y 128 caracteres.",
          })
          return
        }

        if (outcome.code === "persist_failed") {
          res.status(500).json({
            ok: false,
            error: "internal_error",
            message: "No se pudo actualizar la contraseña.",
          })
          return
        }

        res.status(400).json({
          ok: false,
          error: "invalid_request",
          code: "invalid_or_expired_token",
          message: "El enlace no es válido o ya caducó. Solicita uno nuevo.",
        })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/logout",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authBearerService.logoutByAuthorizationHeader(req.headers.authorization)
        res.status(200).json({ ok: true })
      } catch (err) {
        next(err)
      }
    },
  )

  router.get(
    "/me",
    requireBearerAuth(authBearerService),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = res.locals.authContext
        if (!ctx) {
          res.status(500).json({ ok: false, error: "internal_error" })
          return
        }
        const access = await authMeResolution.resolve(ctx.user.userPublicId)
        res.status(200).json({
          ok: true,
          user: {
            userPublicId: ctx.user.userPublicId,
            emailNormalized: ctx.user.emailNormalized,
            fullName: ctx.user.fullName,
            modalityAtSignup: ctx.user.modalityAtSignup,
          },
          session: {
            sessionPublicId: ctx.session.sessionPublicId,
            userPublicId: ctx.session.userPublicId,
            createdAt: ctx.session.createdAt,
            expiresAt: ctx.session.expiresAt,
          },
          access: {
            kind: "registered_user",
          },
          workspace: access.workspace,
          workspaces: access.workspaces,
          workspaceAccess: access.workspaceAccess,
        })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    "/me/active-workspace",
    requireBearerAuth(authBearerService),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = res.locals.authContext
        if (!ctx) {
          res.status(500).json({ ok: false, error: "internal_error" })
          return
        }
        const parsed = postAuthActiveWorkspaceBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            ok: false,
            error: "invalid_request",
            message: 'Se espera JSON { "workspacePublicId": string (UUID) }.',
            details: parsed.error.flatten(),
          })
          return
        }
        const out = await authMeResolution.setPreferredActiveWorkspace(
          ctx.user.userPublicId,
          parsed.data.workspacePublicId,
        )
        if (!out.ok) {
          res.status(400).json({
            ok: false,
            error: out.code,
            message: "El workspace indicado no es utilizable para tu cuenta o no tienes acceso.",
          })
          return
        }
        res.status(200).json({
          ok: true,
          workspace: out.access.workspace,
          workspaces: out.access.workspaces,
          workspaceAccess: out.access.workspaceAccess,
        })
      } catch (err) {
        next(err)
      }
    },
  )

  router.patch(
    "/profile",
    requireBearerAuth(authBearerService),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = res.locals.authContext
        if (!ctx) {
          res.status(500).json({ ok: false, error: "internal_error" })
          return
        }
        const parsed = patchAuthProfileBodySchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Cuerpo JSON inválido para actualizar perfil.",
            details: parsed.error.flatten(),
          })
          return
        }

        const result = await profileUpdateService.execute(
          ctx.user.userPublicId,
          parsed.data,
        )

        if (!result.ok) {
          const f = result.failure
          if (f.code === "user_not_found") {
            res.status(404).json({
              ok: false,
              error: "not_found",
              code: f.code,
              message: f.message,
            })
            return
          }
          if (f.code === "persist_failed") {
            res.status(500).json({
              ok: false,
              error: "internal_error",
              message: f.message,
            })
            return
          }
          res.status(400).json({
            ok: false,
            error: "invalid_request",
            code: f.code,
            message: f.message,
          })
          return
        }

        res.status(200).json({
          ok: true,
          user: {
            userPublicId: result.user.userPublicId,
            emailNormalized: result.user.emailNormalized,
            fullName: result.user.fullName,
            modalityAtSignup: result.user.modalityAtSignup,
          },
        })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
