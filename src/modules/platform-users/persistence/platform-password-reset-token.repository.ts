export type PlatformPasswordResetTokenRow = {
  tokenHash: string
  platformUserId: string
  emailNormalized: string
  expiresAt: Date
  usedAt: Date | null
}

export interface PlatformPasswordResetTokenRepository {
  insert(row: Omit<PlatformPasswordResetTokenRow, "usedAt"> & { usedAt?: null }): Promise<void>

  findValidUnused(
    tokenHash: string,
    asOf: Date,
  ): Promise<{ platformUserId: string; emailNormalized: string } | null>

  markUsed(tokenHash: string, at: Date): Promise<boolean>

  deletePendingForUser(platformUserId: string): Promise<void>

  deleteByTokenHash(tokenHash: string): Promise<void>
}
