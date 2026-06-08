import { randomBytes } from "node:crypto"
import { getWorkspaceAppPublicOrigin } from "../../../config/workspace-app-public-url.js"
import { redactEmail } from "../../../startup-log.js"
import { TransactionalEmailMisconfiguredError } from "../../transactional-email/domain/errors.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { validateIntentPasswordPlain } from "../../registro-onboarding/domain/account-credentials.policy.js"
import { hashIdentityRegistrationIntentPassword } from "../../registro-onboarding/services/intent-password-hash.js"
import type { IdentityRegisteredUserForAuthRepository } from "../persistence/identity-registered-user-for-auth.repository.js"
import type { PasswordResetTokenRepository } from "../persistence/password-reset-token.repository.js"
import type { AuthSessionRepository } from "../persistence/session.repository.js"
import { hashPasswordResetOpaqueToken } from "./password-reset-token-hash.js"

function parsePasswordResetTtlMs(): number {
  const raw = process.env.PASSWORD_RESET_TTL_MS?.trim()
  if (!raw) return 60 * 60 * 1000
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 60_000) return 60 * 60 * 1000
  return Math.min(n, 86_400_000)
}

export type PasswordResetConfirmResult =
  | { ok: true }
  | { ok: false; code: "invalid_or_expired_token" }
  | { ok: false; code: "invalid_new_password" }
  | { ok: false; code: "persist_failed" }

/**
 * Solicitud por correo + confirmación con token opaco (hash en PostgreSQL).
 */
export class PasswordResetService {
  private readonly ttlMs: number

  constructor(
    private readonly users: IdentityRegisteredUserForAuthRepository,
    private readonly resetTokens: PasswordResetTokenRepository,
    private readonly sessions: AuthSessionRepository,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {
    this.ttlMs = parsePasswordResetTtlMs()
  }

  /**
   * Emite token y correo si el usuario existe. No lanza: fallos de correo u origen faltante
   * quedan solo en log (el HTTP responde siempre genérico en la ruta).
   */
  async requestResetForEmail(emailNormalized: string): Promise<void> {
    const user = await this.users.findByEmailNormalized(emailNormalized)
    if (!user) {
      console.error(
        JSON.stringify({
          level: "info",
          msg: "password_reset_no_registered_user_for_email",
          emailRedacted: redactEmail(emailNormalized),
        }),
      )
      return
    }

    const origin = getWorkspaceAppPublicOrigin()
    if (!origin) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "password_reset_skipped_missing_workspace_app_public_base_url",
          userPublicId: user.userPublicId,
        }),
      )
      return
    }

    await this.resetTokens.deletePendingForUser(user.userPublicId)

    const rawToken = randomBytes(32).toString("base64url")
    const tokenHash = hashPasswordResetOpaqueToken(rawToken)
    const expiresAt = new Date(Date.now() + this.ttlMs)

    await this.resetTokens.insert({
      tokenHash,
      userPublicId: user.userPublicId,
      emailNormalized: user.emailNormalized,
      expiresAt,
    })

    const resetUrl = `${origin}/recuperar-contrasena?token=${encodeURIComponent(rawToken)}`
    const profile = await this.users.findProfileByUserPublicId(user.userPublicId)

    try {
      await this.transactionalEmail.sendIdentityRegisteredUserPasswordReset({
        toEmail: user.emailNormalized,
        displayName: profile?.fullName ?? null,
        resetUrl,
      })
    } catch (err) {
      await this.resetTokens.deleteByTokenHash(tokenHash)
      if (err instanceof TransactionalEmailMisconfiguredError) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "password_reset_email_misconfigured",
            userPublicId: user.userPublicId,
            error: err.message,
          }),
        )
      } else {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "password_reset_email_failed",
            userPublicId: user.userPublicId,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
      return
    }

    return
  }

  async confirmWithToken(rawToken: string, newPassword: string): Promise<PasswordResetConfirmResult> {
    const t = rawToken.trim()
    if (t.length < 20) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    const pwdIssue = validateIntentPasswordPlain(newPassword)
    if (pwdIssue === "invalid_password") {
      return { ok: false, code: "invalid_new_password" }
    }

    const tokenHash = hashPasswordResetOpaqueToken(t)
    const now = new Date()
    const row = await this.resetTokens.findValidUnused(tokenHash, now)
    if (!row) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    const nextHash = hashIdentityRegistrationIntentPassword(newPassword)
    const persisted = await this.users.applyProfileUpdates(row.userPublicId, { passwordHash: nextHash })
    if (!persisted) {
      return { ok: false, code: "persist_failed" }
    }

    const marked = await this.resetTokens.markUsed(tokenHash, now)
    if (!marked) {
      return { ok: false, code: "invalid_or_expired_token" }
    }

    await this.sessions.deleteAllByUserPublicId(row.userPublicId)

    return { ok: true }
  }
}
