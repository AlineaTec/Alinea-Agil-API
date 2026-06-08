import type { PlatformRole } from "./platform-role.js"

/**
 * Contexto de sesión **plataforma** — no mezclar con `AuthenticatedSession` del cliente.
 */
export type PlatformSessionContext = {
  platformUserId: string
  email: string
  role: PlatformRole
  /** Presente cuando el contexto viene de `PlatformAuthService` */
  sessionPublicId?: string
}
