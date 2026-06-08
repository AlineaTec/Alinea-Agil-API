/** Token opaco de restablecimiento plataforma (solo hash SHA-256 en BD). TTL por `expiresAt`. */
export interface PlatformPasswordResetTokenDocProps {
  tokenHash: string
  platformUserId: string
  emailNormalized: string
  expiresAt: Date
  usedAt: Date | null
}
