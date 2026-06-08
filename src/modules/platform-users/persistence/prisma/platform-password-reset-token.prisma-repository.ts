import type { PrismaClient } from "@prisma/client"
import type {
  PlatformPasswordResetTokenRepository,
  PlatformPasswordResetTokenRow,
} from "../platform-password-reset-token.repository.js"

export class PlatformPasswordResetTokenPrismaRepository
  implements PlatformPasswordResetTokenRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async insert(row: Omit<PlatformPasswordResetTokenRow, "usedAt"> & { usedAt?: null }): Promise<void> {
    await this.prisma.platformPasswordResetToken.create({
      data: {
        token_hash: row.tokenHash,
        platform_user_id: row.platformUserId,
        email_normalized: row.emailNormalized,
        expires_at: row.expiresAt,
        used_at: null,
      },
    })
  }

  async findValidUnused(
    tokenHash: string,
    asOf: Date,
  ): Promise<{ platformUserId: string; emailNormalized: string } | null> {
    const row = await this.prisma.platformPasswordResetToken.findFirst({
      where: { token_hash: tokenHash, used_at: null, expires_at: { gt: asOf } },
      select: { platform_user_id: true, email_normalized: true },
    })
    if (!row) return null
    return { platformUserId: row.platform_user_id, emailNormalized: row.email_normalized }
  }

  async markUsed(tokenHash: string, at: Date): Promise<boolean> {
    const res = await this.prisma.platformPasswordResetToken.updateMany({
      where: { token_hash: tokenHash, used_at: null },
      data: { used_at: at },
    })
    return res.count > 0
  }

  async deletePendingForUser(platformUserId: string): Promise<void> {
    await this.prisma.platformPasswordResetToken.deleteMany({
      where: { platform_user_id: platformUserId, used_at: null },
    })
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.platformPasswordResetToken.deleteMany({ where: { token_hash: tokenHash } })
  }
}
