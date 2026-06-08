import { randomUUID } from "node:crypto"
import { parseBearerToken } from "../../login-session/http/parse-bearer-token.js"
import {
  generateOpaqueSessionToken,
  hashSessionTokenForStorage,
} from "../../login-session/services/opaque-session-token.js"
import type { PlatformUserState } from "../domain/platform-user.entity.js"
import type { AuthenticatedPlatformAccessSession } from "../domain/platform-access-session.entity.js"
import type { PlatformAccessSessionRepository } from "../persistence/platform-access-session.repository.js"
import type { PlatformUserRepository } from "../persistence/platform-user.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import { platformRoleLabelEs } from "../domain/platform-role-label.es.js"
import { PlatformMfaTotpService } from "./platform-mfa-totp.service.js"
import { verifyPlatformPassword } from "./platform-password.js"

export type PlatformLoginResult =
  | {
      ok: true
      accessToken: string
      expiresAt: Date
      user: PlatformUserState
    }
  | {
      ok: false
      reason: "invalid_credentials" | "mfa_required" | "mfa_invalid" | "inactive" | "locked"
    }

function platformSessionTtlMs(): number {
  const hours = Number(process.env.PLATFORM_SESSION_TTL_HOURS) || 8
  return hours * 60 * 60 * 1000
}

export type PlatformLoginClientInfo = {
  clientIp?: string | null
  userAgent?: string | null
}

/**
 * Autenticación **solo plataforma**: tokens y sesiones distintos del cliente (`AuthBearerService`).
 */
export class PlatformAuthService {
  constructor(
    private readonly users: PlatformUserRepository,
    private readonly sessions: PlatformAccessSessionRepository,
    private readonly mfa: PlatformMfaTotpService,
    private readonly transactionalEmail: TransactionalEmailService | null = null,
  ) {}

  async login(
    email: string,
    password: string,
    totpCode: string | undefined,
    clientInfo?: PlatformLoginClientInfo,
  ): Promise<PlatformLoginResult> {
    const u = await this.users.findByEmail(normalizeEmailBasic(email))
    if (!u?.passwordHash || !u.passwordSalt) {
      return { ok: false, reason: "invalid_credentials" }
    }
    if (!verifyPlatformPassword(password, u.passwordSalt, u.passwordHash)) {
      return { ok: false, reason: "invalid_credentials" }
    }
    if (u.status === "inactive") {
      return { ok: false, reason: "inactive" }
    }
    if (u.mfaLockedUntil && u.mfaLockedUntil.getTime() > Date.now()) {
      return { ok: false, reason: "locked" }
    }
    if (u.mfaStatus === "enrolled") {
      if (!totpCode?.trim()) {
        return { ok: false, reason: "mfa_required" }
      }
      if (!u.mfaTotpSecretBase32 || !this.mfa.verify(u.mfaTotpSecretBase32, totpCode)) {
        return { ok: false, reason: "mfa_invalid" }
      }
    }

    const raw = generateOpaqueSessionToken()
    const tokenHash = hashSessionTokenForStorage(raw)
    const expiresAt = new Date(Date.now() + platformSessionTtlMs())
    const sessionPublicId = randomUUID()
    const sessionStartedAt = new Date()
    await this.sessions.create({
      sessionPublicId,
      platformUserId: u.platformUserId,
      tokenHash,
      expiresAt,
    })

    if (this.transactionalEmail) {
      const greeting = u.displayName?.trim() || u.email
      try {
        await this.transactionalEmail.sendPlatformAdminSessionStarted({
          toEmail: u.email,
          greetingName: greeting,
          email: u.email,
          roleLabel: platformRoleLabelEs(u.role),
          sessionPublicId,
          sessionStartedAt,
          clientIp: clientInfo?.clientIp ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        })
      } catch {
        /* ledger + log en TransactionalEmailService; login ya persistido */
      }
    }

    return { ok: true, accessToken: raw, expiresAt, user: u }
  }

  async resolveFromAuthorizationHeader(
    authorization: string | undefined,
  ): Promise<
    | { ok: true; session: AuthenticatedPlatformAccessSession; user: PlatformUserState }
    | { ok: false; reason: "missing" | "invalid" }
  > {
    const raw = parseBearerToken(authorization)
    if (raw === null || raw.length === 0) {
      return { ok: false, reason: "missing" }
    }
    const tokenHash = hashSessionTokenForStorage(raw)
    const session = await this.sessions.findValidByTokenHash(tokenHash, new Date())
    if (!session) {
      return { ok: false, reason: "invalid" }
    }
    const user = await this.users.findById(session.platformUserId)
    if (!user) {
      return { ok: false, reason: "invalid" }
    }
    return { ok: true, session, user }
  }

  async logoutByAuthorizationHeader(authorization: string | undefined): Promise<void> {
    const r = await this.resolveFromAuthorizationHeader(authorization)
    if (!r.ok) return
    await this.sessions.deleteBySessionPublicId(r.session.sessionPublicId)
  }
}
