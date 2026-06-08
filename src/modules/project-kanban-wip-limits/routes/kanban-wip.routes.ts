import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { KanbanFlowNotFoundError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { KanbanWipConfigService } from "../services/kanban-wip-config.service.js"
import { KanbanWipConfigValidationError } from "../services/kanban-wip-config.service.js"
import { kanbanWipPathParamsSchema, kanbanWipPatchBodySchema } from "../validation/kanban-wip-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondWipError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ProjectRuntimeNotFoundError) {
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
  if (err instanceof KanbanWipConfigValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanFlowNotFoundError) {
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

export function createKanbanWipRouter(
  kanbanWipConfigService: KanbanWipConfigService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/kanban-wip", async (req, res, next) => {
    try {
      const p = kanbanWipPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await kanbanWipConfigService.getWip(
        actor,
        p.data.workspacePublicId,
        p.data.projectPublicId,
      )
      res.status(200).json(out)
    } catch (err) {
      respondWipError(err, res, next)
    }
  })

  router.patch("/kanban-wip", async (req, res, next) => {
    try {
      const p = kanbanWipPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const b = kanbanWipPatchBodySchema.safeParse(req.body ?? {})
      if (!b.success) {
        res.status(400).json({ error: "invalid_body", details: b.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const out = await kanbanWipConfigService.patchWip(actor, p.data.workspacePublicId, p.data.projectPublicId, {
        wipNearThresholdRatio: b.data.wip_near_threshold_ratio,
        columnUpdates: b.data.columns?.map((c) => ({
          columnPublicId: c.column_public_id,
          limit: c.limit,
          policy: c.policy,
        })),
      })
      res.status(200).json(out)
    } catch (err) {
      respondWipError(err, res, next)
    }
  })

  return router
}
