import { Router, type NextFunction, type Request, type Response } from "express"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformTenantForbiddenError, PlatformTenantNotFoundError } from "../../platform-tenants/domain/platform-tenant.errors.js"
import type { WorkspaceCatalogRepository } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import { WorkspaceInvitationError } from "../domain/workspace-invitation.errors.js"
import {
  assertPlatformSessionCanMutateWorkspaceInvitations,
  assertPlatformSessionCanReadWorkspaceInvitations,
} from "../policies/platform-workspace-invitations.policy.js"
import type { WorkspaceInvitationService } from "../services/workspace-invitation.service.js"
import {
  platformWorkspaceInvitationWriteParamsSchema,
  platformWorkspaceInvitationsListQuerySchema,
} from "../validation/workspace-invitations-platform-http.schemas.js"

function sessionOrThrow(res: Response): PlatformSessionContext {
  const s = res.locals.platformSession
  if (!s) throw new Error("platform_session_missing")
  return s
}

function mapInvitationErr(err: unknown, res: Response, next: NextFunction): void {
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
  next(err)
}

/**
 * Rutas plataforma: prefijo `/v1/platform` (middleware de sesión plataforma ya aplicado).
 */
export function createPlatformWorkspaceInvitationsRouter(
  invitationService: WorkspaceInvitationService,
  catalog: WorkspaceCatalogRepository,
): Router {
  const r = Router()

  r.get("/workspace-invitations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = sessionOrThrow(res)
      assertPlatformSessionCanReadWorkspaceInvitations(session)
      const q = platformWorkspaceInvitationsListQuerySchema.parse(req.query)
      if (q.workspacePublicId) {
        const row = await catalog.findByPublicId(q.workspacePublicId)
        if (!row) {
          throw new PlatformTenantNotFoundError("NOT_FOUND", "Workspace no encontrado en catálogo.")
        }
      }
      const out = await invitationService.listInvitationsForPlatformAdmin({
        workspacePublicId: q.workspacePublicId,
        status: q.status,
        emailContains: q.q?.trim() || undefined,
        createdFrom: q.createdFrom ? new Date(q.createdFrom) : undefined,
        createdTo: q.createdTo ? new Date(q.createdTo) : undefined,
        limit: q.limit,
        offset: q.offset,
      })
      res.status(200).json(out)
    } catch (err) {
      if (err instanceof PlatformTenantNotFoundError) {
        res.status(404).json({ error: err.code, message: err.message })
        return
      }
      next(err)
    }
  })

  r.post(
    "/workspaces/:workspacePublicId/workspace-invitations/:invitationPublicId/revoke",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = sessionOrThrow(res)
        assertPlatformSessionCanMutateWorkspaceInvitations(session)
        const params = platformWorkspaceInvitationWriteParamsSchema.parse(req.params)
        const row = await catalog.findByPublicId(params.workspacePublicId)
        if (!row) {
          throw new PlatformTenantNotFoundError("NOT_FOUND", "Workspace no encontrado en catálogo.")
        }
        await invitationService.revokeInvitation(
          params.workspacePublicId,
          params.invitationPublicId,
          session.platformUserId,
        )
        res.status(200).json({ ok: true })
      } catch (err) {
        if (err instanceof PlatformTenantNotFoundError) {
          res.status(404).json({ error: err.code, message: err.message })
          return
        }
        mapInvitationErr(err, res, next)
      }
    },
  )

  r.post(
    "/workspaces/:workspacePublicId/workspace-invitations/:invitationPublicId/resend",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = sessionOrThrow(res)
        assertPlatformSessionCanMutateWorkspaceInvitations(session)
        const params = platformWorkspaceInvitationWriteParamsSchema.parse(req.params)
        const row = await catalog.findByPublicId(params.workspacePublicId)
        if (!row) {
          throw new PlatformTenantNotFoundError("NOT_FOUND", "Workspace no encontrado en catálogo.")
        }
        await invitationService.resendInvitation(
          params.workspacePublicId,
          params.invitationPublicId,
          session.platformUserId,
        )
        res.status(200).json({ ok: true })
      } catch (err) {
        if (err instanceof PlatformTenantNotFoundError) {
          res.status(404).json({ error: err.code, message: err.message })
          return
        }
        mapInvitationErr(err, res, next)
      }
    },
  )

  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PlatformTenantForbiddenError) {
      res.status(403).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof PlatformTenantNotFoundError) {
      res.status(404).json({ error: err.code, message: err.message })
      return
    }
    if (err instanceof Error && err.message === "platform_session_missing") {
      res.status(500).json({ error: "internal_error" })
      return
    }
    next(err)
  })

  return r
}
