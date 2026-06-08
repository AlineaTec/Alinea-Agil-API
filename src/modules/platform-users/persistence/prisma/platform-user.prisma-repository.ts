import type { PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { normalizeEmailBasic } from "../../../registro-onboarding/validation/email-normalization.js"
import type { PlatformRole } from "../../domain/platform-role.js"
import type { PlatformUserState } from "../../domain/platform-user.entity.js"
import type { PlatformUserRepository } from "../platform-user.repository.js"
import { platformUserFromPrisma, platformUserToPrisma } from "./platform-user.prisma-mapper.js"

export class PlatformUserPrismaRepository implements PlatformUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: PlatformUserState, _session?: ClientSession): Promise<void> {
    await this.prisma.platformUser.create({ data: platformUserToPrisma(state) })
  }

  async save(state: PlatformUserState, _session?: ClientSession): Promise<void> {
    const data = platformUserToPrisma(state)
    await this.prisma.platformUser.update({
      where: { platform_user_id: state.platformUserId },
      data: {
        email: data.email,
        display_name: data.display_name,
        role: data.role,
        status: data.status,
        mfa_status: data.mfa_status,
        mfa_totp_secret_base32: data.mfa_totp_secret_base32,
        mfa_failed_attempts: data.mfa_failed_attempts,
        mfa_locked_until: data.mfa_locked_until,
        invitation_nonce_hash: data.invitation_nonce_hash,
        password_salt: data.password_salt,
        password_hash: data.password_hash,
        updated_at: data.updated_at,
      },
    })
  }

  async findById(platformUserId: string, _session?: ClientSession): Promise<PlatformUserState | null> {
    const row = await this.prisma.platformUser.findUnique({
      where: { platform_user_id: platformUserId },
    })
    return row ? platformUserFromPrisma(row) : null
  }

  async findByEmail(email: string, _session?: ClientSession): Promise<PlatformUserState | null> {
    const row = await this.prisma.platformUser.findUnique({
      where: { email: normalizeEmailBasic(email) },
    })
    return row ? platformUserFromPrisma(row) : null
  }

  async listAll(_session?: ClientSession): Promise<PlatformUserState[]> {
    const rows = await this.prisma.platformUser.findMany({ orderBy: { created_at: "desc" } })
    return rows.map(platformUserFromPrisma)
  }

  async countActiveByRole(role: PlatformRole, _session?: ClientSession): Promise<number> {
    return this.prisma.platformUser.count({ where: { role, status: "active" } })
  }

  async countAll(_session?: ClientSession): Promise<number> {
    return this.prisma.platformUser.count()
  }
}
