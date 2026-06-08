import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import { z } from "zod"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  OperatingSnapshotConflictError,
  OperatingSnapshotForbiddenError,
  OperatingSnapshotNotFoundError,
  OperatingSnapshotValidationError,
} from "../domain/operating-snapshot.errors.js"
import { SNAPSHOT_TTL_SECONDS } from "../domain/wizard-stage.js"
import type { OperatingSnapshotService } from "../services/operating-snapshot.service.js"
import {
  operatingSnapshotNbaSnoozeBodySchema,
  operatingSnapshotProjectParamsSchema,
  operatingSnapshotQuerySchema,
} from "../validation/operating-snapshot-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) throw new Error("workspace_users_actor_missing")
  return a
}

function respondErr(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof OperatingSnapshotNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof OperatingSnapshotForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof OperatingSnapshotConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof OperatingSnapshotValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({ error: "internal_error", message: "Workspace actor context missing after auth middleware." })
    return
  }
  next(err)
}

function setSnapshotCacheHeaders(res: Response, generatedAt: string, expiresAt: string, partial: boolean): void {
  res.setHeader("Cache-Control", `private, max-age=${SNAPSHOT_TTL_SECONDS}`)
  res.setHeader("X-Snapshot-Generated-At", generatedAt)
  res.setHeader("X-Snapshot-Expires-At", expiresAt)
  res.setHeader("X-Snapshot-Partial", partial ? "true" : "false")
}

export function createOperatingSnapshotRouter(
  service: OperatingSnapshotService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const params = operatingSnapshotProjectParamsSchema.parse(req.params)
      const query = operatingSnapshotQuerySchema.parse(req.query)
      const actor = getRequiredActor(res)
      const snapshot = await service.getOperatingSnapshot(actor, params.workspacePublicId, params.projectPublicId, {
        forceRefresh: query.forceRefresh ?? false,
        includeCalendarExtract: query.includeCalendarExtract ?? true,
      })
      setSnapshotCacheHeaders(
        res,
        snapshot.refreshMeta.generatedAt,
        snapshot.refreshMeta.expiresAt,
        snapshot.refreshMeta.partial,
      )
      res.status(200).json(snapshot)
    } catch (err) {
      respondErr(err, res, next)
    }
  })

  router.put("/nba-snooze", async (req, res, next) => {
    try {
      const params = operatingSnapshotProjectParamsSchema.parse(req.params)
      const body = operatingSnapshotNbaSnoozeBodySchema.parse(req.body)
      const actor = getRequiredActor(res)
      await service.snoozeNba(actor, params.workspacePublicId, params.projectPublicId, body)
      res.status(204).send()
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "validation_error", message: err.message })
        return
      }
      respondErr(err, res, next)
    }
  })

  return router
}
