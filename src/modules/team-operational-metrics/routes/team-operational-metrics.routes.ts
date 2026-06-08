import type { NextFunction, RequestHandler, Response } from "express"
import { Router } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  assertCanReadTeamOperationalCrossTeam,
  assertCanReadTeamOperationalMemberBreakdown,
  assertCanReadTeamOperationalSummary,
} from "../policies/team-operational-metrics-authorization.policy.js"
import type { TeamOperationalMetricsService } from "../services/team-operational-metrics.service.js"
import {
  teamMetricsMembersQuerySchema,
  teamMetricsSummaryQuerySchema,
  teamOperationalMetricsMountParamsSchema,
  teamOperationalMetricsWorkspaceParamsSchema,
  workspaceTeamsMetricsQuerySchema,
} from "../validation/team-operational-metrics-http.schemas.js"
import { TeamOperationalMetricsForbiddenError, TeamOperationalMetricsNotFoundError } from "../domain/team-operational-metrics.errors.js"

function getActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) throw new Error("workspace_users_actor_missing")
  return a
}

function respondTomError(err: unknown, res: Response): void {
  if (err instanceof TeamOperationalMetricsForbiddenError) {
    res.status(403).json({ error: "forbidden", message: err.message, code: err.code })
    return
  }
  if (err instanceof TeamOperationalMetricsNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message, code: err.code })
    return
  }
  throw err
}

export function createTeamOperationalMetricsRouter(
  service: TeamOperationalMetricsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/teams/:teamPublicId/metrics/summary", async (req, res, next: NextFunction) => {
    try {
      const p = teamOperationalMetricsMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = teamMetricsSummaryQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadTeamOperationalSummary(getActor(res))
      const data = await service.getTeamMetricsSummary(
        getActor(res),
        p.data.workspacePublicId,
        p.data.teamPublicId,
        q.data.projectPublicId,
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamOperationalMetricsForbiddenError || err instanceof TeamOperationalMetricsNotFoundError) {
        respondTomError(err, res)
        return
      }
      next(err)
    }
  })

  router.get("/teams/:teamPublicId/metrics/members", async (req, res, next: NextFunction) => {
    try {
      const p = teamOperationalMetricsMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = teamMetricsMembersQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadTeamOperationalMemberBreakdown(getActor(res))
      const data = await service.getTeamMemberBreakdown(
        getActor(res),
        p.data.workspacePublicId,
        p.data.teamPublicId,
        q.data.projectPublicId,
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamOperationalMetricsForbiddenError || err instanceof TeamOperationalMetricsNotFoundError) {
        respondTomError(err, res)
        return
      }
      next(err)
    }
  })

  router.get("/metrics/teams", async (req, res, next: NextFunction) => {
    try {
      const p = teamOperationalMetricsWorkspaceParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = workspaceTeamsMetricsQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanReadTeamOperationalCrossTeam(getActor(res))
      const data = await service.listWorkspaceTeamsMetrics(
        p.data.workspacePublicId,
        {
          limit: q.data.limit,
          offset: q.data.offset,
          includeArchived: q.data.includeArchived ?? false,
          projectPublicIdFilter: q.data.projectPublicId,
        },
        getActor(res),
      )
      res.status(200).json(data)
    } catch (err) {
      if (err instanceof TeamOperationalMetricsForbiddenError) {
        respondTomError(err, res)
        return
      }
      next(err)
    }
  })

  return router
}
