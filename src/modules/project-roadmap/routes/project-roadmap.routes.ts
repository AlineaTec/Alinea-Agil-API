import { Router, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { RoadmapSummaryService } from "../services/roadmap-summary.service.js"
import { roadmapMountParamsSchema, roadmapSummaryQuerySchema } from "../validation/project-roadmap-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

export function createProjectRoadmapRouter(
  roadmapSummaryService: RoadmapSummaryService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: import("express").RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/summary", async (req, res, next) => {
    try {
      const parsed = roadmapMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = roadmapSummaryQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: q.error.flatten(),
        })
        return
      }
      const actor = getRequiredActor(res)
      const summary = await roadmapSummaryService.getSummary(
        actor,
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        q.data.window ?? "90d",
        q.data.cycleActive ?? false,
      )
      res.json(summary)
    } catch (err) {
      next(err)
    }
  })

  return router
}
