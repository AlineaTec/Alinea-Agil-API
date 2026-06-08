import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkTeamState } from "../domain/work-team.js"
import type { WorkTeamsService } from "../services/work-teams.service.js"
import { workTeamProjectMountParamsSchema } from "../validation/work-team-http.schemas.js"
import { respondWorkTeamError } from "./work-teams.routes.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function workTeamJson(t: WorkTeamState) {
  return {
    teamPublicId: t.teamPublicId,
    workspacePublicId: t.workspacePublicId,
    name: t.name,
    description: t.description,
    status: t.status,
    teamLeadUserPublicId: t.teamLeadUserPublicId,
    targetSize: t.targetSize,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

/**
 * `GET /:projectPublicId/teams` — debe montarse en `app` **antes** que otras rutas
 * bajo `/v1/workspaces/:workspacePublicId/projects` para no perder el matcheo frente a `/:projectPublicId/summary`.
 */
export function createWorkTeamsByProjectRouter(
  workTeamsService: WorkTeamsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/:projectPublicId/teams", async (req, res, next: NextFunction) => {
    try {
      const p = workTeamProjectMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const result = await workTeamsService.listTeamsByProject(
        actor,
        p.data.workspacePublicId,
        p.data.projectPublicId,
      )
      res.status(200).json({
        projectPublicId: result.projectPublicId,
        items: result.items.map(workTeamJson),
      })
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  return router
}
