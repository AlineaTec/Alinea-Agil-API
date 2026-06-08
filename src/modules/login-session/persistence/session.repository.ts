import type { AuthenticatedSession } from "../domain/authenticated-session.entity.js"

export type CreateAuthSessionInput = {
  sessionPublicId: string
  userPublicId: string
  /** SHA-256 hex del token opaco (ver `opaque-session-token.ts`). */
  tokenHash: string
  expiresAt: Date
}

export interface AuthSessionRepository {
  create(input: CreateAuthSessionInput): Promise<AuthenticatedSession>

  /** Sesión vigente por hash del token Bearer (no expirada respecto a `asOf`). */
  findValidByTokenHash(
    tokenHash: string,
    asOf: Date,
  ): Promise<AuthenticatedSession | null>

  /**
   * Elimina la sesión por identificador público (p. ej. logout del token actual).
   * Idempotente: si no existe fila, no es error.
   */
  deleteBySessionPublicId(sessionPublicId: string): Promise<void>

  /** Revoca todas las sesiones del usuario (p. ej. restablecimiento de contraseña). */
  deleteAllByUserPublicId(userPublicId: string): Promise<void>
}
