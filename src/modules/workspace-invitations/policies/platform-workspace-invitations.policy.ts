import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformTenantForbiddenError } from "../../platform-tenants/domain/platform-tenant.errors.js"
import { assertPlatformSessionCanReadTenants } from "../../platform-tenants/policies/platform-tenants.policy.js"

export function assertPlatformSessionCanReadWorkspaceInvitations(session: PlatformSessionContext): void {
  assertPlatformSessionCanReadTenants(session)
}

export function assertPlatformSessionCanMutateWorkspaceInvitations(session: PlatformSessionContext): void {
  assertPlatformSessionCanReadWorkspaceInvitations(session)
  if (session.role === "platform_auditor") {
    throw new PlatformTenantForbiddenError(
      "FORBIDDEN",
      "Los auditores de plataforma no pueden reenviar ni revocar invitaciones de workspace.",
    )
  }
}
