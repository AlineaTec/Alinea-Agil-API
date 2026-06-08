import { Router, type NextFunction, type Request, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { requireBearerAuth } from "../../login-session/middleware/require-bearer-auth.middleware.js"
import { WorkspaceInvitationError } from "../domain/workspace-invitation.errors.js"
import type { WorkspaceInvitationService } from "../services/workspace-invitation.service.js"
import { z } from "zod"

export const invitationAcceptBodySchema = z.object({
  confirm: z.literal(true),
})

export const invitationRegisterBodySchema = z.object({
  fullName: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
})

const tokenParamsSchema = z.object({
  token: z.string().min(16).max(512),
})

function mapInvitationErr(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkspaceInvitationError) {
    const statusByCode: Record<string, number> = {
      invitation_not_found: 404,
      invitation_expired: 410,
      invitation_revoked: 409,
      invitation_superseded: 409,
      invitation_not_pending: 409,
      invitation_requires_different_account: 409,
      invitation_account_already_exists: 409,
      invitation_confirm_required: 400,
      invalid_password: 400,
      workspace_not_accessible: 403,
      workspace_not_found: 404,
      workspace_invitation_blocked_by_billing: 403,
    }
    const status = statusByCode[err.code] ?? 400
    res.status(status).json({ ok: false, error: err.code, message: err.message })
    return
  }
  next(err)
}

/**
 * Rutas públicas (sin membership previa): resolver y aceptar invitación.
 * Prefijo: `/v1/public/workspace-invitations`.
 */
export function createWorkspaceInvitationsPublicRouter(
  invitationService: WorkspaceInvitationService,
  authBearerService: AuthBearerService,
): Router {
  const router = Router()

  router.get("/:token/resolve", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = tokenParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ ok: false, error: "invalid_request", message: "Token inválido." })
        return
      }
      const result = await invitationService.resolvePublicToken(p.data.token)
      res.status(200).json({ ok: true, invitation: result })
    } catch (err) {
      mapInvitationErr(err, res, next)
    }
  })

  router.post("/:token/accept", requireBearerAuth(authBearerService), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = tokenParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ ok: false, error: "invalid_request", message: "Token inválido." })
        return
      }
      const body = invitationAcceptBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          ok: false,
          error: "invalid_request",
          message: 'Se requiere JSON { "confirm": true }.',
        })
        return
      }
      const ctx = res.locals.authContext
      if (!ctx) {
        res.status(500).json({ ok: false, error: "internal_error" })
        return
      }
      const member = await invitationService.acceptWithIdentityRegisteredUser({
        rawToken: p.data.token,
        sessionUserPublicId: ctx.user.userPublicId,
        sessionEmailNormalized: ctx.user.emailNormalized,
        confirm: body.data.confirm,
      })
      res.status(200).json({ ok: true, member })
    } catch (err) {
      mapInvitationErr(err, res, next)
    }
  })

  router.post("/:token/register-and-accept", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = tokenParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ ok: false, error: "invalid_request", message: "Token inválido." })
        return
      }
      const body = invitationRegisterBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          ok: false,
          error: "invalid_request",
          message: "Cuerpo inválido (fullName, password 8–128).",
        })
        return
      }
      const member = await invitationService.registerAndAccept({
        rawToken: p.data.token,
        fullName: body.data.fullName,
        password: body.data.password,
      })
      res.status(201).json({ ok: true, member })
    } catch (err) {
      mapInvitationErr(err, res, next)
    }
  })

  return router
}
