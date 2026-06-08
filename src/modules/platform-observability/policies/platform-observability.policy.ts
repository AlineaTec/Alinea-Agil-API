import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { sessionHasPlatformAdminReaderRole } from "../../platform/platform-admin-readers.js"
import { PlatformObservabilityForbiddenError } from "../domain/platform-observability.errors.js"

/**
 * v1: operator y auditor comparten el mismo nivel de agregados (sin redacción extra aquí).
 */
export function assertPlatformSessionCanReadObservability(session: PlatformSessionContext): void {
  if (!sessionHasPlatformAdminReaderRole(session)) {
    throw new PlatformObservabilityForbiddenError(
      "FORBIDDEN",
      "Rol de plataforma no autorizado para observabilidad.",
    )
  }
}
