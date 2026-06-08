import { Router, type NextFunction, type Request, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  assertWorkspaceSettingsDisplayNameWriteAuthorized,
  assertWorkspaceSettingsReadAuthorized,
  WorkspaceSettingsForbiddenError,
} from "../policies/workspace-settings-authorization.policy.js"
import type { WorkspaceSettingsService } from "../services/workspace-settings.service.js"
import {
  patchWorkspaceDisplayNameBodySchema,
  workspaceSettingsPathParamsSchema,
} from "../validation/workspace-settings.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSettingsError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkspaceSettingsForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
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
 * Rutas bajo `/v1/workspaces/:workspacePublicId/settings`.
 * GET: lectura (administrativo). PATCH display-name: solo `admin`.
 */
export function createWorkspaceSettingsRouter(
  workspaceSettingsService: WorkspaceSettingsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceSettingsPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }

      const actor = getRequiredActor(res)
      assertWorkspaceSettingsReadAuthorized(actor)

      const row = await workspaceSettingsService.getBasicSettings(params.data.workspacePublicId)
      if (!row) {
        res.status(404).json({
          error: "workspace_not_found",
          message: "No se encontró el workspace solicitado.",
        })
        return
      }

      res.status(200).json({
        ok: true,
        workspacePublicId: row.workspacePublicId,
        workspaceDisplayName: row.workspaceDisplayName,
        workspaceCode: row.workspaceCode,
        modality: row.modality,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    } catch (err) {
      respondSettingsError(err, res, next)
    }
  })

  router.patch(
    "/display-name",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = workspaceSettingsPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId debe ser un UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const parsedBody = patchWorkspaceDisplayNameBodySchema.safeParse(req.body)
        if (!parsedBody.success) {
          res.status(400).json({
            error: "invalid_request",
            code: "invalid_body",
            message: "Se espera JSON { workspaceDisplayName: string }.",
            details: parsedBody.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertWorkspaceSettingsDisplayNameWriteAuthorized(actor)

        const result = await workspaceSettingsService.updateDisplayName(
          params.data.workspacePublicId,
          parsedBody.data.workspaceDisplayName,
        )

        if (result.ok) {
          const s = result.settings
          res.status(200).json({
            ok: true,
            workspacePublicId: s.workspacePublicId,
            workspaceDisplayName: s.workspaceDisplayName,
            workspaceCode: s.workspaceCode,
            modality: s.modality,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })
          return
        }

        if (result.kind === "invalid_display_name") {
          res.status(400).json({
            error: "invalid_request",
            code: "invalid_workspace_display_name",
            message: result.message ?? "Nombre del workspace no válido.",
          })
          return
        }

        if (result.kind === "no_effective_change") {
          res.status(400).json({
            error: "invalid_request",
            code: "no_effective_change",
            message: result.message ?? "No hay cambio efectivo.",
          })
          return
        }

        if (result.kind === "workspace_not_found") {
          res.status(404).json({
            error: "workspace_not_found",
            message: "No se encontró el workspace solicitado.",
          })
          return
        }

        res.status(500).json({
          error: "internal_error",
          message: result.message ?? "Error al persistir el nombre del workspace.",
        })
      } catch (err) {
        respondSettingsError(err, res, next)
      }
    },
  )

  return router
}
