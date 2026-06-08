import type { PrismaClient } from "@prisma/client"
import type { AuthenticatedSession } from "../../domain/authenticated-session.entity.js"
import { toAuthenticatedSession } from "../mappers/auth-session.mapper.js"
import type {
  AuthSessionRepository,
  CreateAuthSessionInput,
} from "../session.repository.js"

/**
 * Sesiones de autenticación en PostgreSQL. 
 */
export class AuthSessionPrismaRepository implements AuthSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuthSessionInput): Promise<AuthenticatedSession> {
    const user = await this.prisma.identityUser.findUnique({
      where: { public_id: input.userPublicId },
      select: { id: true },
    })
    if (!user) {
      throw new Error(`identity_user_not_found:${input.userPublicId}`)
    }

    const row = await this.prisma.identityAuthSession.create({
      data: {
        public_id: input.sessionPublicId,
        user_id: user.id,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      },
    })

    return toAuthenticatedSession({
      sessionPublicId: row.public_id,
      userPublicId: input.userPublicId,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  async findValidByTokenHash(
    tokenHash: string,
    asOf: Date,
  ): Promise<AuthenticatedSession | null> {
    const row = await this.prisma.identityAuthSession.findFirst({
      where: { token_hash: tokenHash, expires_at: { gt: asOf } },
      include: { user: { select: { public_id: true } } },
    })
    if (!row) return null

    return toAuthenticatedSession({
      sessionPublicId: row.public_id,
      userPublicId: row.user.public_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  async deleteBySessionPublicId(sessionPublicId: string): Promise<void> {
    await this.prisma.identityAuthSession.deleteMany({
      where: { public_id: sessionPublicId },
    })
  }

  async deleteAllByUserPublicId(userPublicId: string): Promise<void> {
    await this.prisma.identityAuthSession.deleteMany({
      where: { user: { public_id: userPublicId } },
    })
  }
}
