import { BillingSeatExpansionBlockedError } from "../../billing-seat-enforcement/domain/billing-seat-expansion.errors.js"
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { SeatCapacityInvariantError } from "../../workspace-licenses/services/workspace-license.service.js"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import type { WorkspaceMemberState } from "../domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../middleware/workspace-users-auth.middleware.js"
import { assertCanListAssignableMembersForWorkItems } from "../policies/workspace-assignable-members.policy.js"
import {
  assertWorkspaceUsersAuthorized,
  WorkspaceUsersForbiddenError,
} from "../policies/workspace-users-authorization.policy.js"
import {
  WorkspaceUserConflictError,
  WorkspaceUserInvariantError,
} from "../domain/workspace-user.errors.js"
import { WorkspaceUserService } from "../services/workspace-user.service.js"
import type { WorkspaceInvitationService } from "../../workspace-invitations/services/workspace-invitation.service.js"
import { WorkspaceInvitationError } from "../../workspace-invitations/domain/workspace-invitation.errors.js"
import {
  createWorkspaceMemberBodySchema,
  updateWorkspaceMemberRolesBodySchema,
  workspaceMemberPathParamsSchema,
  workspaceUsersPathParamsSchema,
} from "../validation/workspace-users.schemas.js"
import { listWorkspaceMembersQuerySchema } from "../validation/list-workspace-members.schemas.js"

function memberToJson(m: WorkspaceMemberState) {
  return {
    membershipPublicId: m.membershipPublicId,
    workspacePublicId: m.workspacePublicId,
    userPublicId: m.userPublicId,
    emailNormalized: m.emailNormalized,
    fullName: m.fullName,
    status: m.status,
    hasSeatAssigned: m.hasSeatAssigned,
    workspaceRoleAdministrative: m.workspaceRoleAdministrative,
    workspaceRoleMethodological: m.workspaceRoleMethodological,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondUserError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof BillingSeatExpansionBlockedError) {
    res.status(403).json({
      error: err.code,
      message: err.message,
      expansionBlockedReason: err.expansionBlockedReason,
    })
    return
  }
  if (err instanceof WorkspaceUsersForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceUserInvariantError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
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
    res.status(status).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceUserConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SeatCapacityInvariantError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({
      error: "internal_error",
      message: "Workspace actor context missing after auth middleware.",
    })
    return
  }
  if (err instanceof Error && err.message === "workspace_member_not_found") {
    res.status(404).json({
      error: "workspace_member_not_found",
      message: "Miembro no encontrado en este workspace.",
    })
    return
  }
  if (err instanceof Error && err.message === "workspace_license_not_found") {
    res.status(404).json({
      error: "workspace_license_not_found",
      message: "No hay licencias para este workspace.",
    })
    return
  }
  next(err)
}

/**
 * Rutas bajo `/v1/workspaces/:workspacePublicId/members`.
 * Autenticación Bearer + actor miembro del workspace; autorización por rol administrativo.
 */
export function createWorkspaceUsersRouter(
  service: WorkspaceUserService,
  invitationService: WorkspaceInvitationService,
  authBearerService: AuthBearerService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, service))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceUsersPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }
      assertWorkspaceUsersAuthorized({
        actor: getRequiredActor(res),
        action: "list_members",
      })
      const queryParsed = listWorkspaceMembersQuerySchema.safeParse(req.query)
      if (!queryParsed.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Parámetros de listado no válidos.",
          details: queryParsed.error.flatten(),
        })
        return
      }
      const q = queryParsed.data
      const filters = {
        q: q.q,
        status: q.status,
        hasSeatAssigned: q.hasSeatAssigned,
        roleCategory: q.roleCategory,
        workspaceRoleAdministrative: q.workspaceRoleAdministrative,
        workspaceRoleMethodological: q.workspaceRoleMethodological,
        userPublicId: q.userPublicId,
      }
      if (q.statsOnly) {
        const stats = await service.aggregateMemberStats(params.data.workspacePublicId, filters)
        res.status(200).json({ members: [], totalCount: stats.total, stats })
        return
      }
      if (q.limit !== undefined) {
        const page = await service.listMembersPaginated(params.data.workspacePublicId, filters, {
          sort: q.sort,
          limit: q.limit,
          offset: q.offset,
        })
        res.status(200).json({
          members: page.items.map(memberToJson),
          totalCount: page.totalCount,
        })
        return
      }
      const members = await service.listMembers(params.data.workspacePublicId)
      res.status(200).json({
        members: members.map(memberToJson),
        totalCount: members.length,
      })
    } catch (err) {
      respondUserError(err, res, next)
    }
  })

  router.get("/assignable-for-work-items", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceUsersPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }
      assertCanListAssignableMembersForWorkItems(getRequiredActor(res))
      const members = await service.listAssignableMembersForWorkItems(params.data.workspacePublicId)
      res.status(200).json({ members })
    } catch (err) {
      respondUserError(err, res, next)
    }
  })

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceUsersPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }
      assertWorkspaceUsersAuthorized({
        actor: getRequiredActor(res),
        action: "create_member",
      })
      const body = createWorkspaceMemberBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido para crear miembro.",
          details: body.error.flatten(),
        })
        return
      }
      const b = body.data
      const actor = getRequiredActor(res)
      const { invitation } = await invitationService.createInvitationFromAdmin({
        workspacePublicId: params.data.workspacePublicId,
        emailNormalized: normalizeEmailBasic(b.email),
        fullName: b.fullName,
        workspaceRoleAdministrative: b.workspaceRoleAdministrative ?? null,
        workspaceRoleMethodological: b.workspaceRoleMethodological ?? null,
        assignSeat: b.assignSeat,
        actorUserPublicId: actor.userPublicId,
      })
      res.status(201).json({
        kind: "workspace_invitation",
        invitationPublicId: invitation.invitationPublicId,
        workspacePublicId: invitation.workspacePublicId,
        emailNormalized: invitation.emailNormalized,
        fullName: invitation.fullNameProposed,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        assignSeatProposal: invitation.assignSeatProposal,
        workspaceRoleAdministrative: invitation.workspaceRoleAdministrative,
        workspaceRoleMethodological: invitation.workspaceRoleMethodological,
      })
    } catch (err) {
      respondUserError(err, res, next)
    }
  })

  router.delete("/:membershipPublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceMemberPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Parámetros de ruta inválidos.",
          details: params.error.flatten(),
        })
        return
      }
      assertWorkspaceUsersAuthorized({
        actor: getRequiredActor(res),
        action: "delete_member",
      })
      await service.removeMember(
        params.data.workspacePublicId,
        params.data.membershipPublicId,
        getRequiredActor(res).userPublicId,
      )
      res.status(200).json({ ok: true })
    } catch (err) {
      respondUserError(err, res, next)
    }
  })

  router.post(
    "/:membershipPublicId/activate",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = workspaceMemberPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Parámetros de ruta inválidos.",
            details: params.error.flatten(),
          })
          return
        }
        assertWorkspaceUsersAuthorized({
          actor: getRequiredActor(res),
          action: "activate_member",
        })
        const member = await service.activateMember(
          params.data.workspacePublicId,
          params.data.membershipPublicId,
          getRequiredActor(res).userPublicId,
        )
        res.status(200).json(member)
      } catch (err) {
        respondUserError(err, res, next)
      }
    },
  )

  router.post(
    "/:membershipPublicId/deactivate",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = workspaceMemberPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Parámetros de ruta inválidos.",
            details: params.error.flatten(),
          })
          return
        }
        assertWorkspaceUsersAuthorized({
          actor: getRequiredActor(res),
          action: "deactivate_member",
        })
        const member = await service.deactivateMember(
          params.data.workspacePublicId,
          params.data.membershipPublicId,
          getRequiredActor(res).userPublicId,
        )
        res.status(200).json(member)
      } catch (err) {
        respondUserError(err, res, next)
      }
    },
  )

  router.post(
    "/:membershipPublicId/assign-seat",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = workspaceMemberPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Parámetros de ruta inválidos.",
            details: params.error.flatten(),
          })
          return
        }
        assertWorkspaceUsersAuthorized({
          actor: getRequiredActor(res),
          action: "assign_seat",
        })
        const member = await service.assignSeat(
          params.data.workspacePublicId,
          params.data.membershipPublicId,
          getRequiredActor(res).userPublicId,
        )
        res.status(200).json(member)
      } catch (err) {
        respondUserError(err, res, next)
      }
    },
  )

  router.post(
    "/:membershipPublicId/release-seat",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = workspaceMemberPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Parámetros de ruta inválidos.",
            details: params.error.flatten(),
          })
          return
        }
        assertWorkspaceUsersAuthorized({
          actor: getRequiredActor(res),
          action: "release_seat",
        })
        const member = await service.releaseSeat(
          params.data.workspacePublicId,
          params.data.membershipPublicId,
          getRequiredActor(res).userPublicId,
        )
        res.status(200).json(member)
      } catch (err) {
        respondUserError(err, res, next)
      }
    },
  )

  router.patch(
    "/:membershipPublicId/roles",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = workspaceMemberPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Parámetros de ruta inválidos.",
            details: params.error.flatten(),
          })
          return
        }
        const body = updateWorkspaceMemberRolesBodySchema.safeParse(req.body)
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Cuerpo inválido para actualizar roles.",
            details: body.error.flatten(),
          })
          return
        }
        const b = body.data
        const target = await service.getMemberInWorkspace(
          params.data.workspacePublicId,
          params.data.membershipPublicId,
        )
        if (!target) {
          res.status(404).json({
            error: "workspace_member_not_found",
            message: "Miembro no encontrado en este workspace.",
          })
          return
        }

        const payloadHasAdministrativeRole = b.workspaceRoleAdministrative !== undefined
        const payloadHasMethodologicalRole = b.workspaceRoleMethodological !== undefined

        assertWorkspaceUsersAuthorized({
          actor: getRequiredActor(res),
          action: "update_roles",
          roleUpdateContext: {
            target,
            payloadHasAdministrativeRole,
            payloadHasMethodologicalRole,
          },
        })

        const member = await service.updateMemberRoles(params.data.workspacePublicId, {
          membershipPublicId: params.data.membershipPublicId,
          workspaceRoleAdministrative: b.workspaceRoleAdministrative ?? null,
          workspaceRoleMethodological: b.workspaceRoleMethodological ?? null,
          actorUserPublicId: getRequiredActor(res).userPublicId,
        })
        res.status(200).json(member)
      } catch (err) {
        respondUserError(err, res, next)
      }
    },
  )

  return router
}
