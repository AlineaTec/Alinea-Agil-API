import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { KanbanFlowNotFoundError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import {
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { FlowTimeForbiddenError, FlowTimeScrumNotSupportedError, FlowTimeValidationError } from "../domain/flow-time.errors.js"
import type { FlowTimeService } from "../services/flow-time.service.js"
import { flowTimeMountParamsSchema, flowTimeQuerySchema } from "../validation/flow-time-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondFlowTimeError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof FlowTimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof FlowTimeValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof FlowTimeScrumNotSupportedError) {
    res.status(422).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanFlowNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeInvalidInputError) {
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
 * Montado bajo:
 * `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-metrics/flow-time`
 */
export function createProjectCycleLeadTimeRouter(
  flowTimeService: FlowTimeService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const p = flowTimeMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_params", issues: p.error.flatten() })
        return
      }
      const q = flowTimeQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", issues: q.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const body = await flowTimeService.getFlowTime(
        actor,
        p.data.workspacePublicId,
        p.data.projectPublicId,
        {
          from: q.data.from,
          to: q.data.to,
          timeZone: q.data.timeZone,
          includeItemDetails: q.data.includeItemDetails,
        },
      )
      res.status(200).json(body)
    } catch (err) {
      respondFlowTimeError(err, res, next)
    }
  })

  return router
}
