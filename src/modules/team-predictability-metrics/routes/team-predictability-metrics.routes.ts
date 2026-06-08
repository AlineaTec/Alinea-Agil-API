import type { NextFunction, RequestHandler, Response } from "express"
import { Router } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  assertCanReadPredictabilityCrossTeam,
  assertCanReadPredictabilityPeriodTrend,
  assertCanReadPredictabilitySummary,
} from "../policies/team-predictability-metrics-authorization.policy.js"
import type { TeamPredictabilityMetricsService } from "../services/team-predictability-metrics.service.js"
import {
  listPredictabilityTeamsQuerySchema,
  predictabilitySummaryQuerySchema,
  predictabilityTeamParamsSchema,
  predictabilityTrendQuerySchema,
  predictabilityWorkspaceParamsSchema,
} from "../validation/team-predictability-metrics-http.schemas.js"
import {
  TeamPredictabilityMetricsForbiddenError,
  TeamPredictabilityMetricsNotFoundError,
} from "../domain/team-predictability-metrics.errors.js"

function getActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) throw new Error("workspace_users_actor_missing")
  return a
}

function respondError(err: unknown, res: Response): void {
  if (err instanceof TeamPredictabilityMetricsForbiddenError) {
    res.status(403).json({ error: "forbidden", message: err.message, code: err.code })
    return
  }
  if (err instanceof TeamPredictabilityMetricsNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message, code: err.code })
    return
  }
  throw err
}

export function createTeamPredictabilityMetricsRouter(
  service: TeamPredictabilityMetricsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/teams/:teamPublicId/predictability/summary", async (req, res, next: NextFunction) => {
    try {
      const p = predictabilityTeamParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = predictabilitySummaryQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadPredictabilitySummary(getActor(res))
      const data = await service.getPredictabilitySummary(
        p.data.workspacePublicId,
        p.data.teamPublicId,
        q.data.projectPublicId,
        q.data.lastN,
        getActor(res),
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamPredictabilityMetricsForbiddenError || err instanceof TeamPredictabilityMetricsNotFoundError) {
        respondError(err, res)
        return
      }
      next(err)
    }
  })

  router.get("/teams/:teamPublicId/predictability/trend", async (req, res, next: NextFunction) => {
    try {
      const p = predictabilityTeamParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = predictabilityTrendQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadPredictabilityPeriodTrend(getActor(res))
      const data = await service.getPredictabilityTrend(
        p.data.workspacePublicId,
        p.data.teamPublicId,
        q.data.projectPublicId,
        q.data.lastN,
        getActor(res),
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamPredictabilityMetricsForbiddenError || err instanceof TeamPredictabilityMetricsNotFoundError) {
        respondError(err, res)
        return
      }
      next(err)
    }
  })

  router.get("/metrics/predictability/teams", async (req, res, next: NextFunction) => {
    try {
      const p = predictabilityWorkspaceParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = listPredictabilityTeamsQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadPredictabilityCrossTeam(getActor(res))
      const data = await service.listWorkspacePredictabilityTeams(
        p.data.workspacePublicId,
        {
          limit: q.data.limit,
          offset: q.data.offset,
          includeArchived: q.data.includeArchived,
          projectPublicIdFilter: q.data.projectPublicId,
          lastN: q.data.lastN,
          methodologyFilter: q.data.methodology,
        },
        getActor(res),
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamPredictabilityMetricsForbiddenError) {
        respondError(err, res)
        return
      }
      next(err)
    }
  })

  return router
}
