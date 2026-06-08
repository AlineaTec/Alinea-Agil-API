import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { sessionHasPlatformAdminReaderRole } from "../../platform/platform-admin-readers.js"
import { PlatformTenantForbiddenError } from "../domain/platform-tenant.errors.js"

export function assertPlatformSessionCanReadTenants(session: PlatformSessionContext): void {
  if (!sessionHasPlatformAdminReaderRole(session)) {
    throw new PlatformTenantForbiddenError(
      "FORBIDDEN",
      "Rol de plataforma no autorizado para listar tenants.",
    )
  }
}

export function assertPlatformSessionCanMutateTenantStatus(session: PlatformSessionContext): void {
  if (session.role !== "platform_super_admin") {
    throw new PlatformTenantForbiddenError(
      "FORBIDDEN",
      "Solo platform_super_admin puede suspender o reactivar tenants.",
    )
  }
}
