import type { PrismaClient } from "@prisma/client"
import type { AuthenticatedPlatformAccessSession } from "../../domain/platform-access-session.entity.js"
import type {
  CreatePlatformAccessSessionInput,
  PlatformAccessSessionRepository,
} from "../platform-access-session.repository.js"

export class PlatformAccessSessionPrismaRepository implements PlatformAccessSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreatePlatformAccessSessionInput): Promise<AuthenticatedPlatformAccessSession> {
    await this.prisma.platformAccessSession.create({
      data: {
        session_public_id: input.sessionPublicId,
        platform_user_id: input.platformUserId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      },
    })
    return {
      sessionPublicId: input.sessionPublicId,
      platformUserId: input.platformUserId,
      expiresAt: input.expiresAt,
    }
  }

  async findValidByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticatedPlatformAccessSession | null> {
    const row = await this.prisma.platformAccessSession.findFirst({
      where: { token_hash: tokenHash, expires_at: { gt: now } },
    })
    if (!row) return null
    return {
      sessionPublicId: row.session_public_id,
      platformUserId: row.platform_user_id,
      expiresAt: row.expires_at,
    }
  }

  async deleteBySessionPublicId(sessionPublicId: string): Promise<void> {
    await this.prisma.platformAccessSession.deleteMany({
      where: { session_public_id: sessionPublicId },
    })
  }

  async deleteAllByPlatformUserId(platformUserId: string): Promise<void> {
    await this.prisma.platformAccessSession.deleteMany({
      where: { platform_user_id: platformUserId },
    })
  }
}
