import type { AuthenticatedPlatformAccessSession } from "../domain/platform-access-session.entity.js"

export type CreatePlatformAccessSessionInput = {
  sessionPublicId: string
  platformUserId: string
  tokenHash: string
  expiresAt: Date
}

export interface PlatformAccessSessionRepository {
  create(input: CreatePlatformAccessSessionInput): Promise<AuthenticatedPlatformAccessSession>
  findValidByTokenHash(tokenHash: string, now: Date): Promise<AuthenticatedPlatformAccessSession | null>
  deleteBySessionPublicId(sessionPublicId: string): Promise<void>
  deleteAllByPlatformUserId(platformUserId: string): Promise<void>
}
