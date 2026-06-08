import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { sessionHasPlatformAdminReaderRole } from "../../platform/platform-admin-readers.js"
import {
  PlatformIdentityRegistrationIntentsMutationForbiddenError,
  PlatformIdentityRegistrationIntentsReadForbiddenError,
} from "../domain/platform-registration-intents.errors.js"

export function assertPlatformSessionCanListIdentityRegistrationIntents(
  session: PlatformSessionContext,
): void {
  if (!sessionHasPlatformAdminReaderRole(session)) {
    throw new PlatformIdentityRegistrationIntentsReadForbiddenError(
      "FORBIDDEN",
      "Rol de plataforma no autorizado para listar intents de registro.",
    )
  }
}

/** Borrar intents o purgar colección: sólo super administrador. */
export function assertPlatformSessionCanMutateIdentityRegistrationIntents(
  session: PlatformSessionContext,
): void {
  if (session.role !== "platform_super_admin") {
    throw new PlatformIdentityRegistrationIntentsMutationForbiddenError(
      "FORBIDDEN",
      "Solo platform_super_admin puede borrar o purgar intents de registro.",
    )
  }
}
