export type PasswordResetTokenRow = {
  tokenHash: string
  userPublicId: string
  emailNormalized: string
  expiresAt: Date
  usedAt: Date | null
}

export interface PasswordResetTokenRepository {
  insert(row: Omit<PasswordResetTokenRow, "usedAt"> & { usedAt?: null }): Promise<void>

  /** Fila vigente y no consumida. */
  findValidUnused(
    tokenHash: string,
    asOf: Date,
  ): Promise<{ userPublicId: string; emailNormalized: string } | null>

  markUsed(tokenHash: string, at: Date): Promise<boolean>

  /** Invalida solicitudes pendientes del usuario antes de emitir una nueva. */
  deletePendingForUser(userPublicId: string): Promise<void>

  deleteByTokenHash(tokenHash: string): Promise<void>
}
