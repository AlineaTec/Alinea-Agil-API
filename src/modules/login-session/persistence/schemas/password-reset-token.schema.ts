/**
 * Token opaco de restablecimiento (solo hash SHA-256 en BD). TTL por `expiresAt`.
 */
export interface PasswordResetTokenDocProps {
  tokenHash: string
  userPublicId: string
  emailNormalized: string
  expiresAt: Date
  usedAt: Date | null
}
