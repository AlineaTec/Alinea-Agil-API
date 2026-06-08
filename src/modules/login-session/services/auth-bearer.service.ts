import type { AuthenticatedSession } from "../domain/authenticated-session.entity.js"
import type { AuthenticatedUserProfile } from "../domain/authenticated-user-profile.entity.js"
import { parseBearerToken } from "../http/parse-bearer-token.js"
import type { IdentityRegisteredUserForAuthRepository } from "../persistence/identity-registered-user-for-auth.repository.js"
import type { AuthSessionRepository } from "../persistence/session.repository.js"
import { hashSessionTokenForStorage } from "./opaque-session-token.js"

export type AuthBearerFailureReason =
  | "missing_authorization"
  | "invalid_bearer"
  | "session_not_found_or_expired"

export type AuthBearerResolveResult =
  | {
      ok: true
      session: AuthenticatedSession
      user: AuthenticatedUserProfile
    }
  | {
      ok: false
      reason: AuthBearerFailureReason
    }

/**
 * Resuelve identidad desde `Authorization: Bearer <accessToken>` (mismo opaco que emite login).
 */
export class AuthBearerService {
  constructor(
    private readonly sessions: AuthSessionRepository,
    private readonly users: IdentityRegisteredUserForAuthRepository,
  ) {}

  async resolveFromAuthorizationHeader(
    authorization: string | undefined,
  ): Promise<AuthBearerResolveResult> {
    const raw = parseBearerToken(authorization)
    if (raw === null) {
      return { ok: false, reason: "missing_authorization" }
    }
    if (raw.length === 0) {
      return { ok: false, reason: "invalid_bearer" }
    }

    const tokenHash = hashSessionTokenForStorage(raw)
    const session = await this.sessions.findValidByTokenHash(
      tokenHash,
      new Date(),
    )
    if (!session) {
      return { ok: false, reason: "session_not_found_or_expired" }
    }

    const user = await this.users.findProfileByUserPublicId(session.userPublicId)
    if (!user) {
      return { ok: false, reason: "session_not_found_or_expired" }
    }

    return { ok: true, session, user }
  }

  /**
   * Cierra la sesión asociada al Bearer si el token resuelve a una sesión vigente.
   * Si el token falta, es inválido o la sesión ya no existe, no hace nada (idempotente para el cliente).
   */
  async logoutByAuthorizationHeader(authorization: string | undefined): Promise<void> {
    const r = await this.resolveFromAuthorizationHeader(authorization)
    if (!r.ok) return
    await this.sessions.deleteBySessionPublicId(r.session.sessionPublicId)
  }
}
