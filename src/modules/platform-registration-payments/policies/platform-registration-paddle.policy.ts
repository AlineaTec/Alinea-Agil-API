import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { sessionHasPlatformAdminReaderRole } from "../../platform/platform-admin-readers.js"
import { PlatformRegistrationPaddleForbiddenError } from "../domain/platform-registration-paddle.errors.js"

export function assertPlatformSessionCanReadRegistrationPaddle(
  session: PlatformSessionContext,
): void {
  if (!sessionHasPlatformAdminReaderRole(session)) {
    throw new PlatformRegistrationPaddleForbiddenError(
      "FORBIDDEN",
      "Rol de plataforma no autorizado para ver datos de registro Paddle.",
    )
  }
}
