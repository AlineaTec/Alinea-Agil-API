/**
 * Sesión **plataforma** — tokens opacos separados de `AuthSession` (cliente).
 */
export interface PlatformAccessSessionDocProps {
  sessionPublicId: string
  platformUserId: string
  tokenHash: string
  expiresAt: Date
}
