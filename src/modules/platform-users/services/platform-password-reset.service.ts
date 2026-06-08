import { randomBytes } from "node:crypto"
import { redactEmail } from "../../../startup-log.js"
import { getPlatformAdminPublicBaseUrl } from "../../transactional-email/config/transactional-email-env.js"
import { TransactionalEmailMisconfiguredError } from "../../transactional-email/domain/errors.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import { hashPasswordResetOpaqueToken } from "../../login-session/services/password-reset-token-hash.js"
import type { PlatformAccessSessionRepository } from "../persistence/platform-access-session.repository.js"
import type { PlatformPasswordResetTokenRepository } from "../persistence/platform-password-reset-token.repository.js"
import type { PlatformUserRepository } from "../persistence/platform-user.repository.js"
import { hashPlatformPassword } from "./platform-password.js"

function parsePasswordResetTtlMs(): number {
  const raw = process.env.PASSWORD_RESET_TTL_MS?.trim()
  if (!raw) return 60 * 60 * 1000
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 60_000) return 60 * 60 * 1000
  return Math.min(n, 86_400_000)
}

export type PlatformPasswordResetConfirmResult =
  | { ok: true }
  | { ok: false; code: "invalid_or_expired_token" }
  | { ok: false; code: "invalid_new_password" }
  | { ok: false; code: "persist_failed" }

/**
 * Restablecimiento de contraseña para usuarios de plataforma (`platform_users`).
 */
export class PlatformPasswordResetService {
  private readonly ttlMs: number

  constructor(
    private readonly users: PlatformUserRepository,
    private readonly resetTokens: PlatformPasswordResetTokenRepository,
    private readonly sessions: PlatformAccessSessionRepository,
    private readonly transactionalEmail: TransactionalEmailService | null,
  ) {
    this.ttlMs = parsePasswordResetTtlMs()
  }

  async requestResetForEmail(emailNormalized: string): Promise<void> {
    const user = await this.users.findByEmail(normalizeEmailBasic(emailNormalized))
    if (!user?.passwordHash || user.status !== "active") {
      console.error(
        JSON.stringify({
          level: "info",
          msg: "platform_password_reset_skipped_no_eligible_user",
          emailRedacted: redactEmail(emailNormalized),
        }),
      )
      return
    }

    const origin = getPlatformAdminPublicBaseUrl()
    if (!origin) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "platform_password_reset_skipped_missing_platform_admin_public_base_url",
          platformUserId: user.platformUserId,
        }),
      )
      return
    }

    if (!this.transactionalEmail) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "platform_password_reset_skipped_no_transactional_email_service",
          platformUserId: user.platformUserId,
        }),
      )
      return
    }

    await this.resetTokens.deletePendingForUser(user.platformUserId)

    const rawToken = randomBytes(32).toString("base64url")
    const tokenHash = hashPasswordResetOpaqueToken(rawToken)
    const expiresAt = new Date(Date.now() + this.ttlMs)

    await this.resetTokens.insert({
      tokenHash,
      platformUserId: user.platformUserId,
      emailNormalized: user.email,
      expiresAt,
    })

    const resetUrl = `${origin}/forgot-password?token=${encodeURIComponent(rawToken)}`

    try {
      await this.transactionalEmail.sendPlatformAdminPasswordReset({
        toEmail: user.email,
        displayName: user.displayName,
        resetUrl,
      })
    } catch (err) {
      await this.resetTokens.deleteByTokenHash(tokenHash)
      if (err instanceof TransactionalEmailMisconfiguredError) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "platform_password_reset_email_misconfigured",
            platformUserId: user.platformUserId,
            error: err.message,
          }),
        )
      } else {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "platform_password_reset_email_failed",
            platformUserId: user.platformUserId,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
  }

  async confirmWithToken(rawToken: string, newPassword: string): Promise<PlatformPasswordResetConfirmResult> {
    const t = rawToken.trim()
    if (t.length < 20) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    if (newPassword.length < 10 || newPassword.length > 128) {
      return { ok: false, code: "invalid_new_password" }
    }

    const tokenHash = hashPasswordResetOpaqueToken(t)
    const now = new Date()
    const row = await this.resetTokens.findValidUnused(tokenHash, now)
    if (!row) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    const user = await this.users.findById(row.platformUserId)
    if (!user || user.status !== "active" || !user.passwordHash) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    const { salt, hash } = hashPlatformPassword(newPassword)
    user.passwordSalt = salt
    user.passwordHash = hash
    user.updatedAt = now

    try {
      await this.users.save(user)
    } catch {
      return { ok: false, code: "persist_failed" }
    }

    const marked = await this.resetTokens.markUsed(tokenHash, now)
    if (!marked) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    await this.sessions.deleteAllByPlatformUserId(row.platformUserId)

    return { ok: true }
  }
}
