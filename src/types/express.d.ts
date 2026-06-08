import type { AuthenticatedSession } from "../modules/login-session/domain/authenticated-session.entity.js"
import type { AuthenticatedUserProfile } from "../modules/login-session/domain/authenticated-user-profile.entity.js"
import type { WorkspaceMemberState } from "../modules/workspace-users/domain/workspace-member.js"

declare global {
  namespace Express {
    interface Locals {
      /** Poblado por `requireBearerAuth` para rutas protegidas posteriores. */
      authContext?: {
        session: AuthenticatedSession
        user: AuthenticatedUserProfile
      }
      /** Miembro del workspace que coincide con el usuario autenticado (workspace-users). */
      workspaceUsersActor?: WorkspaceMemberState
    }
  }
}

export {}
