import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { SprintBoardForbiddenError } from "../../project-scrum-sprint-board/domain/sprint-board.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import { BurndownVelocityNotFoundError, BurndownVelocityValidationError } from "../domain/burndown-velocity.errors.js"
import { assertCanReadScrumBurndownVelocity } from "../policies/scrum-burndown-velocity-read.policy.js"
import type { ScrumBurndownVelocityService } from "../services/scrum-burndown-velocity.service.js"
import { burndownSprintParamsSchema, includeIdealLineFromQuery, projectParamsSchema } from "../validation/burndown-velocity-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function parseLastNFromQuery(v: unknown): number {
  if (v === undefined || v === null || v === "") return 6
  const s = Array.isArray(v) ? v[0] : v
  const n = parseInt(String(s), 10)
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 1 || n > 12) {
    throw new BurndownVelocityValidationError("Query lastN must be an integer from 1 to 12.")
  }
  return n
}

function respondBurndownVelocityError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof BurndownVelocityValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof BurndownVelocityNotFoundError) {
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
 * `GET /v1/workspaces/.../projects/.../scrum-sprints/:sprintPublicId/burndown`
 * Montar en el prefijo `scrum-sprints`.
 */
export function createScrumSprintBurndownRouter(
  service: ScrumBurndownVelocityService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/:sprintPublicId/burndown", async (req, res, next) => {
    try {
      const parsed = burndownSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadScrumBurndownVelocity(actor)
      const includeIdealLine = includeIdealLineFromQuery(req.query)
      const body = await service.getSprintBurndown(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
        { includeIdealLine },
      )
      res.status(200).json(body)
    } catch (err) {
      respondBurndownVelocityError(err, res, next)
    }
  })

  return router
}

/**
 * `GET /v1/workspaces/.../projects/.../scrum-metrics/velocity?lastN=6`
 * Montar en el prefijo `scrum-metrics`.
 */
export function createScrumProjectVelocityRouter(
  service: ScrumBurndownVelocityService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/velocity", async (req, res, next) => {
    try {
      const parsed = projectParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadScrumBurndownVelocity(actor)
      const lastN = parseLastNFromQuery(req.query.lastN)
      const body = await service.getProjectVelocity(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        lastN,
      )
      res.status(200).json(body)
    } catch (err) {
      respondBurndownVelocityError(err, res, next)
    }
  })

  return router
}
