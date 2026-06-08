import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { sessionHasPlatformAdminReaderRole } from "../../platform/platform-admin-readers.js"
import { PlatformAuditReadForbiddenError } from "../domain/platform-audit-read.errors.js"

export function assertPlatformSessionCanReadAudit(session: PlatformSessionContext): void {
  if (!sessionHasPlatformAdminReaderRole(session)) {
    throw new PlatformAuditReadForbiddenError(
      "FORBIDDEN",
      "Rol de plataforma no autorizado para consultar auditoría.",
    )
  }
}
