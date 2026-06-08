import type { PlatformUser } from "@prisma/client"
import type { PlatformUserState } from "../../domain/platform-user.entity.js"

export function platformUserFromPrisma(row: PlatformUser): PlatformUserState {
  return {
    platformUserId: row.platform_user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as PlatformUserState["role"],
    status: row.status as PlatformUserState["status"],
    mfaStatus: row.mfa_status as PlatformUserState["mfaStatus"],
    mfaTotpSecretBase32: row.mfa_totp_secret_base32,
    mfaFailedAttempts: row.mfa_failed_attempts,
    mfaLockedUntil: row.mfa_locked_until,
    invitationNonceHash: row.invitation_nonce_hash,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function platformUserToPrisma(state: PlatformUserState) {
  return {
    platform_user_id: state.platformUserId,
    email: state.email,
    display_name: state.displayName,
    role: state.role,
    status: state.status,
    mfa_status: state.mfaStatus,
    mfa_totp_secret_base32: state.mfaTotpSecretBase32,
    mfa_failed_attempts: state.mfaFailedAttempts,
    mfa_locked_until: state.mfaLockedUntil,
    invitation_nonce_hash: state.invitationNonceHash,
    password_salt: state.passwordSalt,
    password_hash: state.passwordHash,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}
