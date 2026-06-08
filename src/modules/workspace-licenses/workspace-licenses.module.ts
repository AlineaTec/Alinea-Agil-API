import type { Express } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { createWorkspaceRepositories } from "../../infrastructure/persistence/workspace-repositories.factory.js"
import type { WorkspaceLicenseRepository } from "./persistence/workspace-license.repository.js"
import { createWorkspaceLicensesRouter } from "./routes/workspace-licenses.routes.js"
import { WorkspaceLicenseService } from "./services/workspace-license.service.js"

export { WorkspaceLicenseService }

export function createWorkspaceLicenseService(
  auditLogRepository?: WorkspaceAuditLogRepository | null,
  licenseRepository?: WorkspaceLicenseRepository,
): WorkspaceLicenseService {
  const repo = licenseRepository ?? createWorkspaceRepositories().license
  return new WorkspaceLicenseService(repo, auditLogRepository ?? null)
}

export type MountWorkspaceLicensesModuleOptions = {
  workspaceLicenseService: WorkspaceLicenseService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
}

/**
 * Monta `/v1/workspaces/:workspacePublicId/license/*`.
 * Requiere Bearer y membresía con rol administrativo (misma base que workspace-users).
 */
export function mountWorkspaceLicensesModule(
  app: Express,
  options: MountWorkspaceLicensesModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/license",
    createWorkspaceLicensesRouter(
      options.workspaceLicenseService,
      options.authBearerService,
      options.workspaceUserService,
    ),
  )
}
