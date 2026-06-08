import type { PlatformSessionContext } from "../domain/platform-session.context.js"
import { PlatformUserForbiddenError } from "../domain/platform-user.errors.js"

/** Solo `platform_super_admin` muta identidades de plataforma (APU-05, APU-06, APU-07). */
export function assertPlatformSuperAdminForIdentityMutation(session: PlatformSessionContext): void {
  if (session.role !== "platform_super_admin") {
    throw new PlatformUserForbiddenError(
      "FORBIDDEN",
      "Solo platform_super_admin puede administrar usuarios de plataforma.",
    )
  }
}
