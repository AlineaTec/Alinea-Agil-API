import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import type { WorkTeamAuditRepository } from "./persistence/work-team-audit.repository.js"
import type { WorkTeamMembershipRepository } from "./persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "./persistence/work-team-project-link.repository.js"
import type { WorkTeamRepository } from "./persistence/work-team.repository.js"
import { createWorkTeamsByProjectRouter } from "./routes/work-teams-by-project.routes.js"
import { createWorkTeamsRouter } from "./routes/work-teams.routes.js"
import { WorkTeamsService } from "./services/work-teams.service.js"

export type CreateWorkTeamsServiceWorkspaceDeps = {
  workTeam: WorkTeamRepository
  workTeamMembership: WorkTeamMembershipRepository
  workTeamProjectLink: WorkTeamProjectLinkRepository
}

export function createWorkTeamsService(
  projectRuntimeRepository: ProjectRuntimeRepository,
  workspaceUserService: WorkspaceUserService,
  workspace: CreateWorkTeamsServiceWorkspaceDeps,
  workTeamAuditRepository: WorkTeamAuditRepository,
): WorkTeamsService {
  return new WorkTeamsService(
    workspace.workTeam,
    workspace.workTeamMembership,
    workspace.workTeamProjectLink,
    workTeamAuditRepository,
    projectRuntimeRepository,
    workspaceUserService,
  )
}

export { WorkTeamsService } from "./services/work-teams.service.js"

export type MountWorkspaceWorkTeamsModuleOptions = {
  workTeamsService: WorkTeamsService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/** Rutas `/v1/workspaces/:workspacePublicId/teams` y el listado por proyecto (vía `mountWorkTeamsByProjectRoutesFirst`). */
export function mountWorkspaceWorkTeamsModule(app: Express, options: MountWorkspaceWorkTeamsModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/teams",
    createWorkTeamsRouter(options.workTeamsService, options.authBearerService, options.workspaceUserService, options.billingPrimaryProductMutationGate),
  )
}

/**
 * Debe registrarse **antes** de `mountWorkspaceProjectRuntimeModule` para que
 * `GET .../projects/:projectPublicId/teams` tenga prioridad sobre `.../summary`.
 */
export function mountWorkTeamsByProjectRoutesFirst(
  app: Express,
  options: MountWorkspaceWorkTeamsModuleOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects",
    createWorkTeamsByProjectRouter(options.workTeamsService, options.authBearerService, options.workspaceUserService, options.billingPrimaryProductMutationGate),
  )
}
