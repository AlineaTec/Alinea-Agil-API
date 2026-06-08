import type { PlatformRole } from "../platform-users/domain/platform-role.js"
import type { PlatformSessionContext } from "../platform-users/domain/platform-session.context.js"

/** Roles de plataforma con lectura típica en módulos admin (users tiene reglas adicionales por ruta). */
export const PLATFORM_ADMIN_READER_ROLES: readonly PlatformRole[] = [
  "platform_super_admin",
  "platform_operator",
  "platform_auditor",
]

export function sessionHasPlatformAdminReaderRole(session: PlatformSessionContext): boolean {
  return (PLATFORM_ADMIN_READER_ROLES as readonly string[]).includes(session.role)
}
