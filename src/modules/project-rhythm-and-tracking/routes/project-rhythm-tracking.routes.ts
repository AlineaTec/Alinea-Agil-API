import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRhythmTrackingForbiddenError, ProjectRhythmTrackingNotFoundError } from "../domain/project-rhythm-tracking.errors.js"
import { assertCanReadProjectRhythmTracking } from "../policies/project-rhythm-tracking-authorization.policy.js"
import type { ProjectRhythmTrackingService } from "../services/project-rhythm-tracking.service.js"
import { rhythmTrackingPathParamsSchema } from "../validation/project-rhythm-tracking-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondRhythmError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ProjectRhythmTrackingNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRhythmTrackingForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({
      error: "internal_error",
      message: "Workspace actor context missing after auth middleware.",
    })
    return
  }
  next(err)
}

/**
 * `GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/rhythm-tracking`
 */
export function createProjectRhythmTrackingRouter(
  rhythmTrackingService: ProjectRhythmTrackingService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const parsed = rhythmTrackingPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadProjectRhythmTracking(actor)
      const body = await rhythmTrackingService.getRhythmTracking(
        actor,
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
      )
      res.status(200).json(body)
    } catch (err) {
      respondRhythmError(err, res, next)
    }
  })

  return router
}
