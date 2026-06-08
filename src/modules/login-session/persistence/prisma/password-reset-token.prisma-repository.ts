import type { PrismaClient } from "@prisma/client"
import type {
  PasswordResetTokenRepository,
  PasswordResetTokenRow,
} from "../password-reset-token.repository.js"

/**
 * Tokens de restablecimiento de contraseña en PostgreSQL. en runtime.
 */
export class PasswordResetTokenPrismaRepository implements PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(row: Omit<PasswordResetTokenRow, "usedAt"> & { usedAt?: null }): Promise<void> {
    const user = await this.prisma.identityUser.findUnique({
      where: { public_id: row.userPublicId },
      select: { id: true },
    })
    if (!user) {
      throw new Error(`identity_user_not_found:${row.userPublicId}`)
    }

    await this.prisma.identityPasswordResetToken.create({
      data: {
        token_hash: row.tokenHash,
        user_id: user.id,
        email_normalized: row.emailNormalized,
        expires_at: row.expiresAt,
        used_at: null,
      },
    })
  }

  async findValidUnused(
    tokenHash: string,
    asOf: Date,
  ): Promise<{ userPublicId: string; emailNormalized: string } | null> {
    const row = await this.prisma.identityPasswordResetToken.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: asOf },
      },
      include: { user: { select: { public_id: true } } },
    })
    if (!row) return null
    return {
      userPublicId: row.user.public_id,
      emailNormalized: row.email_normalized,
    }
  }

  async markUsed(tokenHash: string, at: Date): Promise<boolean> {
    const res = await this.prisma.identityPasswordResetToken.updateMany({
      where: { token_hash: tokenHash, used_at: null },
      data: { used_at: at },
    })
    return res.count > 0
  }

  async deletePendingForUser(userPublicId: string): Promise<void> {
    await this.prisma.identityPasswordResetToken.deleteMany({
      where: { user: { public_id: userPublicId }, used_at: null },
    })
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.identityPasswordResetToken.deleteMany({
      where: { token_hash: tokenHash },
    })
  }
}
