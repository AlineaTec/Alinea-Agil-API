import type { RequestHandler } from "express"
import { requireBearerAuth } from "../../login-session/middleware/require-bearer-auth.middleware.js"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../services/workspace-user.service.js"
import { workspaceUsersPathParamsSchema } from "../validation/workspace-users.schemas.js"

/**
 * Bearer + resolución del miembro del workspace que coincide con el usuario autenticado.
 * Deja `res.locals.workspaceUsersActor` o responde 401/403.
 */
export function workspaceUsersAuthMiddlewares(
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
): RequestHandler[] {
  return [requireBearerAuth(authBearerService), loadWorkspaceUsersActor(workspaceUserService)]
}

function loadWorkspaceUsersActor(workspaceUserService: WorkspaceUserService): RequestHandler {
  return async (req, res, next) => {
    const ctx = res.locals.authContext
    if (!ctx) {
      res.status(500).json({
        error: "internal_error",
        message: "Missing auth context after bearer middleware.",
      })
      return
    }

    const parsed = workspaceUsersPathParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      next()
      return
    }

    const actor = await workspaceUserService.findActorMember(
      parsed.data.workspacePublicId,
      ctx.user.userPublicId,
    )

    if (!actor) {
      res.status(403).json({
        error: "forbidden",
        code: "not_workspace_member",
        message: "Authenticated user is not a member of this workspace.",
      })
      return
    }

    res.locals.workspaceUsersActor = actor
    next()
  }
}
