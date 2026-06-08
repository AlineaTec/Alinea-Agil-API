import type { Express } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import { createWorkspaceInvitationsPublicRouter } from "./routes/workspace-invitations.public.routes.js"
import type { WorkspaceInvitationService } from "./services/workspace-invitation.service.js"

/** Rutas públicas: `/v1/public/workspace-invitations`. */
export function mountWorkspaceInvitationsPublicModule(
  app: Express,
  invitationService: WorkspaceInvitationService,
  authBearerService: AuthBearerService,
): void {
  app.use(
    "/v1/public/workspace-invitations",
    createWorkspaceInvitationsPublicRouter(invitationService, authBearerService),
  )
}
