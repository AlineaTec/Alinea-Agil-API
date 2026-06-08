import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import {
  assertWorkspaceUsersAuthorized,
  WorkspaceUsersForbiddenError,
} from "../../workspace-users/policies/workspace-users-authorization.policy.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  workspaceInvitationPathParamsSchema,
  workspaceUsersPathParamsSchema,
} from "../../workspace-users/validation/workspace-users.schemas.js"
import type { WorkspaceInvitationService } from "../services/workspace-invitation.service.js"
import { WorkspaceInvitationError } from "../domain/workspace-invitation.errors.js"

function getActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) throw new Error("workspace_users_actor_missing")
  return a
}

function mapErr(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkspaceUsersForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceInvitationError) {
    const statusByCode: Record<string, number> = {
      invitation_not_found: 404,
      invitation_expired: 410,
      invitation_revoked: 409,
      invitation_superseded: 409,
      invitation_not_pending: 409,
      workspace_invitation_blocked_by_billing: 403,
    }
    const status = statusByCode[err.code] ?? 400
    res.status(status).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({ error: "internal_error" })
    return
  }
  next(err)
}

/** Rutas `/v1/workspaces/:workspacePublicId/workspace-invitations/...` */
export function createWorkspaceInvitationsWorkspaceRouter(
  invitationService: WorkspaceInvitationService,
  workspaceUserService: WorkspaceUserService,
  authBearerService: AuthBearerService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.post(
    "/:invitationPublicId/revoke",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const paramsParsed = workspaceInvitationPathParamsSchema.safeParse(req.params)
        if (!paramsParsed.success) {
          res.status(400).json({ error: "invalid_request", message: "Parámetros inválidos." })
          return
        }
        assertWorkspaceUsersAuthorized({
          actor: getActor(res),
          action: "manage_workspace_invitations",
        })
        await invitationService.revokeInvitation(
          paramsParsed.data.workspacePublicId,
          paramsParsed.data.invitationPublicId,
          getActor(res).userPublicId,
        )
        res.status(200).json({ ok: true })
      } catch (err) {
        mapErr(err, res, next)
      }
    },
  )

  router.post(
    "/:invitationPublicId/resend",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const paramsParsed = workspaceInvitationPathParamsSchema.safeParse(req.params)
        if (!paramsParsed.success) {
          res.status(400).json({ error: "invalid_request", message: "Parámetros inválidos." })
          return
        }
        assertWorkspaceUsersAuthorized({
          actor: getActor(res),
          action: "manage_workspace_invitations",
        })
        await invitationService.resendInvitation(
          paramsParsed.data.workspacePublicId,
          paramsParsed.data.invitationPublicId,
          getActor(res).userPublicId,
        )
        res.status(200).json({ ok: true })
      } catch (err) {
        mapErr(err, res, next)
      }
    },
  )

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsParsed = workspaceUsersPathParamsSchema.safeParse(req.params)
      if (!paramsParsed.success) {
        res.status(400).json({ error: "invalid_request", message: "Parámetros inválidos." })
        return
      }
      assertWorkspaceUsersAuthorized({
        actor: getActor(res),
        action: "manage_workspace_invitations",
      })
      const pending = await invitationService.listPendingInvitationsSafe(paramsParsed.data.workspacePublicId)
      res.status(200).json({ invitations: pending })
    } catch (err) {
      mapErr(err, res, next)
    }
  })

  return router
}
