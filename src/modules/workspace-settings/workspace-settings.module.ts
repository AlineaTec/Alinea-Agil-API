import type { Express } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceSettingsRepository } from "./persistence/workspace-settings-read.repository.js"
import { createWorkspaceSettingsRouter } from "./routes/workspace-settings.routes.js"
import { WorkspaceSettingsService } from "./services/workspace-settings.service.js"

export { WorkspaceSettingsService } from "./services/workspace-settings.service.js"

/** Repo alineado con `WORKSPACE_PERSISTENCE_DRIVER` (vía `runtimePersistence.workspace.settings`). */
export function createWorkspaceSettingsService(
  settings: WorkspaceSettingsRepository,
): WorkspaceSettingsService {
  return new WorkspaceSettingsService(settings)
}

export type MountWorkspaceSettingsModuleOptions = {
  workspaceSettingsService: WorkspaceSettingsService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
}

/**
 * Monta `GET` y `PATCH .../settings/display-name` bajo `/v1/workspaces/:workspacePublicId/settings`.
 * Misma cadena Bearer + actor que `workspace-users` / `workspace-licenses`.
 */
export function mountWorkspaceSettingsModule(
  app: Express,
  options: MountWorkspaceSettingsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/settings",
    createWorkspaceSettingsRouter(
      options.workspaceSettingsService,
      options.authBearerService,
      options.workspaceUserService,
    ),
  )
}
