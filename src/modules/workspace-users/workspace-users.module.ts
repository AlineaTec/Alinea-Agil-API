import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { Express, RequestHandler } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceLicenseService } from "../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceSeatExpansionGate } from "../billing-seat-enforcement/domain/workspace-seat-expansion-gate.js"
import { createWorkspaceRepositories } from "../../infrastructure/persistence/workspace-repositories.factory.js"
import type { WorkspaceMemberRepository } from "./persistence/workspace-member.repository.js"
import { createWorkspaceUsersRouter } from "./routes/workspace-users.routes.js"
import { WorkspaceUserService } from "./services/workspace-user.service.js"
import type { WorkspaceInvitationService } from "../workspace-invitations/services/workspace-invitation.service.js"
import { createWorkspaceInvitationsWorkspaceRouter } from "../workspace-invitations/routes/workspace-invitations.workspace.routes.js"

export function createWorkspaceUserService(
  licenses: WorkspaceLicenseService,
  seatExpansionGate?: WorkspaceSeatExpansionGate,
  auditLogRepository?: WorkspaceAuditLogRepository | null,
  memberRepository?: WorkspaceMemberRepository,
): WorkspaceUserService {
  const members = memberRepository ?? createWorkspaceRepositories().member
  return new WorkspaceUserService(members, licenses, seatExpansionGate, auditLogRepository ?? null)
}

export { WorkspaceUserService } from "./services/workspace-user.service.js"
export type { AuthMeWorkspaceContext } from "./dto/auth-me-workspace-context.dto.js"
export { AuthMeResolutionService } from "./services/auth-me-resolution.service.js"

export type MountWorkspaceUsersModuleOptions = {
  workspaceUserService: WorkspaceUserService
  workspaceInvitationService: WorkspaceInvitationService
  authBearerService: AuthBearerService
  billingPrimaryProductMutationGate: RequestHandler
}

/** Rutas `/v1/workspaces/:workspacePublicId/members` y `.../workspace-invitations`. */
export function mountWorkspaceUsersModule(app: Express, options: MountWorkspaceUsersModuleOptions): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/members",
    createWorkspaceUsersRouter(
      options.workspaceUserService,
      options.workspaceInvitationService,
      options.authBearerService,
      options.billingPrimaryProductMutationGate,
    ),
  )
  app.use(
    "/v1/workspaces/:workspacePublicId/workspace-invitations",
    createWorkspaceInvitationsWorkspaceRouter(
      options.workspaceInvitationService,
      options.workspaceUserService,
      options.authBearerService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
