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
import { KanbanFlowNotFoundError } from "../domain/kanban-flow.errors.js"
import type { KanbanFlowService } from "../services/kanban-flow.service.js"
import { kanbanFlowPathParamsSchema } from "../validation/kanban-flow-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondKanbanFlowError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof KanbanFlowNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeInvalidInputError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
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
 * Rutas bajo `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban`.
 */
export function createProjectKanbanCoreRouter(
  kanbanFlowService: KanbanFlowService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/flow", async (req, res, next) => {
    try {
      const parsed = kanbanFlowPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const flow = await kanbanFlowService.getFlowConfigForRead(actor, workspacePublicId, projectPublicId)
      res.status(200).json(flow)
    } catch (err) {
      respondKanbanFlowError(err, res, next)
    }
  })

  return router
}
