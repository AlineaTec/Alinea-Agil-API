import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { sprintStateToJson } from "../../project-scrum-sprint-planning/services/sprint-planning.service.js"
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
import { assertCanMutateSprintBoard } from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
import {
  SprintClosureNotFoundError,
  SprintClosureValidationError,
} from "../domain/sprint-closure.errors.js"
import type { SprintClosureService } from "../services/sprint-closure.service.js"
import { sprintClosureSprintParamsSchema } from "../validation/sprint-closure-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSprintClosureError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SprintClosureValidationError) {
    res.status(400).json({
      error: err.code,
      message: err.message,
      ...(err.zodIssues ? { issues: err.zodIssues } : {}),
    })
    return
  }
  if (err instanceof SprintClosureNotFoundError) {
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
export function createProjectScrumSprintClosureRouter(
  sprintClosureService: SprintClosureService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.post("/:sprintPublicId/close", async (req, res, next) => {
    try {
      const parsedParams = sprintClosureSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintBoard(actor)
      const sprint = await sprintClosureService.closeSprint(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        actor.userPublicId,
        req.body,
      )
      res.status(200).json(sprintStateToJson(sprint))
    } catch (err) {
      respondSprintClosureError(err, res, next)
    }
  })

  return router
}
