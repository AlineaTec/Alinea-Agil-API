import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { sessionHasPlatformAdminReaderRole } from "../../platform/platform-admin-readers.js"
import { PlatformLicensingForbiddenError } from "../domain/platform-licensing.errors.js"

export function assertPlatformSessionCanReadLicensing(session: PlatformSessionContext): void {
  if (!sessionHasPlatformAdminReaderRole(session)) {
    throw new PlatformLicensingForbiddenError(
      "FORBIDDEN",
      "Rol de plataforma no autorizado para consultar licencias.",
    )
  }
}
