import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  SprintBoardForbiddenError,
  SprintBoardNotFoundError,
  SprintBoardValidationError,
} from "../../project-scrum-sprint-board/domain/sprint-board.errors.js"
import { assertCanReadBasicSprintMetrics } from "../policies/sprint-metrics-read.policy.js"
import {
  SprintMetricsNotFoundError,
  SprintMetricsValidationError,
} from "../domain/sprint-metrics.errors.js"
import type { SprintMetricsService } from "../services/sprint-metrics.service.js"
import { basicSprintMetricsToJson } from "../services/sprint-metrics.service.js"
import { sprintMetricsSprintParamsSchema } from "../validation/sprint-metrics-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSprintMetricsError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SprintMetricsValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintMetricsNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeInvalidInputError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
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
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`.
 */
export function createProjectScrumSprintMetricsRouter(
  sprintMetricsService: SprintMetricsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/:sprintPublicId/metrics", async (req, res, next) => {
    try {
      const parsed = sprintMetricsSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadBasicSprintMetrics(actor)
      const metrics = await sprintMetricsService.getBasicSprintMetrics(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.status(200).json(basicSprintMetricsToJson(metrics))
    } catch (err) {
      respondSprintMetricsError(err, res, next)
    }
  })

  return router
}
