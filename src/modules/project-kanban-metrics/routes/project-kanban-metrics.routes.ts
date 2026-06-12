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
import { KanbanMetricsForbiddenError, KanbanMetricsValidationError } from "../domain/kanban-metrics.errors.js"
import {
  FlowTimeForbiddenError,
  FlowTimeScrumNotSupportedError,
  FlowTimeValidationError,
} from "../../project-cycle-lead-time/domain/flow-time.errors.js"
import type { FlowTimeService } from "../../project-cycle-lead-time/services/flow-time.service.js"
import type { KanbanMetricsService } from "../services/kanban-metrics.service.js"
import {
  kanbanMetricsMountParamsSchema,
  kanbanMetricsThroughputQuerySchema,
} from "../validation/kanban-metrics-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondKanbanMetricsError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof KanbanMetricsForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof KanbanMetricsValidationError || err instanceof FlowTimeValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof FlowTimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
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
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-metrics`.
 */
export function createProjectKanbanMetricsRouter(
  kanbanMetricsService: KanbanMetricsService,
  flowTimeService: FlowTimeService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/snapshot", async (req, res, next) => {
    try {
      const parsed = kanbanMetricsMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const snap = await kanbanMetricsService.getFlowSnapshot(
        actor,
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
      )
      res.status(200).json(snap)
    } catch (err) {
      respondKanbanMetricsError(err, res, next)
    }
  })

  router.get("/throughput", async (req, res, next) => {
    try {
      const parsedParams = kanbanMetricsMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedQuery = kanbanMetricsThroughputQuerySchema.safeParse(req.query)
      if (!parsedQuery.success) {
        res.status(400).json({ error: "invalid_query", issues: parsedQuery.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const body = await kanbanMetricsService.getThroughput(
        actor,
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedQuery.data,
      )
      res.status(200).json(body)
    } catch (err) {
      respondKanbanMetricsError(err, res, next)
    }
  })

  router.get("/bootstrap", async (req, res, next) => {
    try {
      const parsed = kanbanMetricsMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const { workspacePublicId, projectPublicId } = parsed.data
      const [snapshot, throughput, aging, flowTime] = await Promise.all([
        kanbanMetricsService.getFlowSnapshot(actor, workspacePublicId, projectPublicId),
        kanbanMetricsService.getThroughput(actor, workspacePublicId, projectPublicId, {}),
        kanbanMetricsService.getAging(actor, workspacePublicId, projectPublicId),
        flowTimeService.getFlowTime(actor, workspacePublicId, projectPublicId, {
          includeItemDetails: false,
        }),
      ])
      res.status(200).json({ snapshot, throughput, aging, flowTime })
    } catch (err) {
      respondKanbanMetricsError(err, res, next)
    }
  })

  router.get("/aging", async (req, res, next) => {
    try {
      const parsed = kanbanMetricsMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const body = await kanbanMetricsService.getAging(
        actor,
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
      )
      res.status(200).json(body)
    } catch (err) {
      respondKanbanMetricsError(err, res, next)
    }
  })

  return router
}
