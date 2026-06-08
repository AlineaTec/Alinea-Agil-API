import type { NextFunction, RequestHandler, Response } from "express"
import { Router } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  assertCanReadFlowDeliveryCrossTeam,
  assertCanReadFlowDeliverySummary,
} from "../policies/team-flow-delivery-metrics-authorization.policy.js"
import type { TeamFlowDeliveryMetricsService } from "../services/team-flow-delivery-metrics.service.js"
import {
  teamFlowMetricsMountParamsSchema,
  teamFlowMetricsWorkspaceParamsSchema,
  teamFlowMetricsSummaryQuerySchema,
  workspaceFlowTeamsQuerySchema,
} from "../validation/team-flow-delivery-metrics-http.schemas.js"
import {
  TeamFlowDeliveryMetricsForbiddenError,
  TeamFlowDeliveryMetricsNotFoundError,
} from "../domain/team-flow-delivery-metrics.errors.js"

function getActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) throw new Error("workspace_users_actor_missing")
  return a
}

function respondError(err: unknown, res: Response): void {
  if (err instanceof TeamFlowDeliveryMetricsForbiddenError) {
    res.status(403).json({ error: "forbidden", message: err.message, code: err.code })
    return
  }
  if (err instanceof TeamFlowDeliveryMetricsNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message, code: err.code })
    return
  }
  throw err
}

export function createTeamFlowDeliveryMetricsRouter(
  service: TeamFlowDeliveryMetricsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/teams/:teamPublicId/flow/summary", async (req, res, next: NextFunction) => {
    try {
      const p = teamFlowMetricsMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = teamFlowMetricsSummaryQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadFlowDeliverySummary(getActor(res))
      const data = await service.getFlowSummary(
        p.data.workspacePublicId,
        p.data.teamPublicId,
        q.data.projectPublicId,
        q.data.from,
        q.data.to,
        getActor(res),
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamFlowDeliveryMetricsForbiddenError || err instanceof TeamFlowDeliveryMetricsNotFoundError) {
        respondError(err, res)
        return
      }
      next(err)
    }
  })

  router.get("/metrics/flow/teams", async (req, res, next: NextFunction) => {
    try {
      const p = teamFlowMetricsWorkspaceParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = workspaceFlowTeamsQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadFlowDeliveryCrossTeam(getActor(res))
      const data = await service.listWorkspaceFlowTeams(
        p.data.workspacePublicId,
        {
          limit: q.data.limit,
          offset: q.data.offset,
          includeArchived: q.data.includeArchived ?? false,
          projectPublicIdFilter: q.data.projectPublicId,
          fromOverride: q.data.from,
          toOverride: q.data.to,
          methodologyFilter: q.data.methodology,
        },
        getActor(res),
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamFlowDeliveryMetricsForbiddenError) {
        respondError(err, res)
        return
      }
      next(err)
    }
  })

  return router
}
