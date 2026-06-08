import { Router, type NextFunction, type Request, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  assertWorkspaceLicensesAuthorized,
  WorkspaceLicensesForbiddenError,
} from "../policies/workspace-licenses-authorization.policy.js"
import {
  SeatCapacityInvariantError,
  SeatReductionScheduleError,
  WorkspaceLicenseService,
} from "../services/workspace-license.service.js"
import {
  increaseSeatsBodySchema,
  scheduleSeatReductionBodySchema,
  workspaceLicensePathParamsSchema,
} from "../validation/workspace-licenses.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondLicenseError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkspaceLicensesForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SeatCapacityInvariantError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SeatReductionScheduleError) {
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
  if (err instanceof Error && err.message === "workspace_license_not_found") {
    res.status(404).json({
      error: "workspace_license_not_found",
      message: "No hay estado de licencias para este workspace.",
    })
    return
  }
  next(err)
}

/**
 * Rutas bajo `/v1/workspaces/:workspacePublicId/license`.
 * Bearer + actor miembro (mismo middleware que workspace-users); autorización por rol administrativo.
 */
export function createWorkspaceLicensesRouter(
  service: WorkspaceLicenseService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))

  router.get("/summary", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceLicensePathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }

      assertWorkspaceLicensesAuthorized({
        actor: getRequiredActor(res),
        action: "view_summary",
      })

      const summary = await service.getSummary(params.data.workspacePublicId)
      if (!summary) {
        res.status(404).json({
          error: "workspace_license_not_found",
          message: "No hay estado de licencias para este workspace.",
        })
        return
      }
      res.status(200).json(summary)
    } catch (err) {
      respondLicenseError(err, res, next)
    }
  })

  router.post("/increase", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceLicensePathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }
      const body = increaseSeatsBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: 'Se espera JSON { "increment": number entero > 0 }.',
          details: body.error.flatten(),
        })
        return
      }

      assertWorkspaceLicensesAuthorized({
        actor: getRequiredActor(res),
        action: "mutate_license",
      })

      const actor = getRequiredActor(res)
      const summary = await service.increaseSeats(
        params.data.workspacePublicId,
        body.data.increment,
        { actorUserPublicId: actor.userPublicId },
      )
      res.status(200).json(summary)
    } catch (err) {
      respondLicenseError(err, res, next)
    }
  })

  router.post("/schedule-reduction", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceLicensePathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }
      const body = scheduleSeatReductionBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message:
            'Se espera JSON { "targetPurchasedAfterRenewal": number entero >= 0 }.',
          details: body.error.flatten(),
        })
        return
      }

      assertWorkspaceLicensesAuthorized({
        actor: getRequiredActor(res),
        action: "mutate_license",
      })

      const actor = getRequiredActor(res)
      const summary = await service.scheduleSeatReduction(
        params.data.workspacePublicId,
        body.data.targetPurchasedAfterRenewal,
        { actorUserPublicId: actor.userPublicId },
      )
      res.status(200).json(summary)
    } catch (err) {
      respondLicenseError(err, res, next)
    }
  })

  router.post("/scheduled-reduction/clear", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceLicensePathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }

      assertWorkspaceLicensesAuthorized({
        actor: getRequiredActor(res),
        action: "mutate_license",
      })

      const actor = getRequiredActor(res)
      const summary = await service.clearScheduledReduction(params.data.workspacePublicId, {
        actorUserPublicId: actor.userPublicId,
      })
      res.status(200).json(summary)
    } catch (err) {
      respondLicenseError(err, res, next)
    }
  })

  return router
}
