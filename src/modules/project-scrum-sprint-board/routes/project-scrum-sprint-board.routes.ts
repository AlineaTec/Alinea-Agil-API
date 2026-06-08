import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { sprintStateToJson } from "../../project-scrum-sprint-planning/services/sprint-planning.service.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  SprintBoardForbiddenError,
  SprintBoardNotFoundError,
  SprintBoardValidationError,
} from "../domain/sprint-board.errors.js"
import { getWorkControlOverrideTokenFromRequest } from "../../work-ready-done-controls/utils/work-controls-http.util.js"
import { WorkControlsBlockedError, WorkControlsValidationError } from "../../work-ready-done-controls/domain/work-ready-done-controls.errors.js"
import {
  assertCanMutateSprintBoard,
  assertCanReadSprintBoard,
} from "../policies/sprint-board-authorization.policy.js"
import type { SprintBoardService } from "../services/sprint-board.service.js"
import {
  moveSprintBoardColumnBodySchema,
  sprintBoardItemParamsSchema,
  sprintBoardSprintParamsSchema,
} from "../validation/sprint-board-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSprintBoardError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SprintBoardValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
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
  if (err instanceof WorkControlsBlockedError) {
    res.status(409).json({
      error: err.code,
      message: err.message,
      work_controls: err.payload,
    })
    return
  }
  if (err instanceof WorkControlsValidationError) {
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
  next(err)
}

/**
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`
 * (junto al router de planning).
 */
export function createProjectScrumSprintBoardRouter(
  sprintBoardService: SprintBoardService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.post("/:sprintPublicId/start", async (req, res, next) => {
    try {
      const parsed = sprintBoardSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintBoard(actor)
      const sprint = await sprintBoardService.startSprint(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.status(200).json(sprintStateToJson(sprint))
    } catch (err) {
      respondSprintBoardError(err, res, next)
    }
  })

  router.get("/:sprintPublicId/board", async (req, res, next) => {
    try {
      const parsed = sprintBoardSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintBoard(actor)
      const view = await sprintBoardService.getBoard(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.json(view)
    } catch (err) {
      respondSprintBoardError(err, res, next)
    }
  })

  router.post("/:sprintPublicId/items/:backlogItemPublicId/move-board-column", async (req, res, next) => {
    try {
      const parsedParams = sprintBoardItemParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = moveSprintBoardColumnBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({ error: "invalid_body", issues: parsedBody.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintBoard(actor)
      const view = await sprintBoardService.moveBoardItem(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        parsedParams.data.backlogItemPublicId,
        parsedBody.data.boardColumn,
        {
          actor,
          workControlOverrideToken: getWorkControlOverrideTokenFromRequest(req),
        },
      )
      res.json(view)
    } catch (err) {
      respondSprintBoardError(err, res, next)
    }
  })

  return router
}
