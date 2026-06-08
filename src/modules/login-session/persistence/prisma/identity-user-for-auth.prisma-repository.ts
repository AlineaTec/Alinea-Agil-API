import type { PrismaClient } from "@prisma/client"
import type { AuthenticatedUserProfile } from "../../domain/authenticated-user-profile.entity.js"
import type {
  IdentityRegisteredUserAuthRecord,
  IdentityRegisteredUserCredentialRecord,
  IdentityRegisteredUserForAuthRepository,
} from "../identity-registered-user-for-auth.repository.js"
import {
  toAuthenticatedUserProfile,
  toIdentityRegisteredUserAuthRecord,
  toIdentityRegisteredUserCredentialRecord,
  type CreateIdentityUserPersistenceInput,
} from "./identity-user.prisma-mapper.js"

/**
 * Persistencia PostgreSQL de usuarios registrados (auth/perfil).
 * Implementación Prisma del puerto de usuarios registrados.
 */
export class IdentityUserForAuthPrismaRepository
  implements IdentityRegisteredUserForAuthRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  /** Creación materializada tras activación (provisioning); no expuesto en el puerto de dominio. */
  async createRegisteredUser(input: CreateIdentityUserPersistenceInput): Promise<void> {
    await this.prisma.identityUser.create({
      data: {
        public_id: input.publicId,
        email_normalized: input.emailNormalized,
        full_name: input.fullName,
        password_hash: input.passwordHash,
        modality_at_signup: input.modalityAtSignup,
        source_registration_intent_public_id: input.sourceRegistrationIntentPublicId,
      },
    })
  }

  async findByEmailNormalized(
    emailNormalized: string,
  ): Promise<IdentityRegisteredUserAuthRecord | null> {
    const row = await this.prisma.identityUser.findUnique({
      where: { email_normalized: emailNormalized },
      select: { public_id: true, email_normalized: true, password_hash: true },
    })
    return row ? toIdentityRegisteredUserAuthRecord(row) : null
  }

  async findProfileByUserPublicId(
    userPublicId: string,
  ): Promise<AuthenticatedUserProfile | null> {
    const row = await this.prisma.identityUser.findUnique({
      where: { public_id: userPublicId },
      select: {
        public_id: true,
        email_normalized: true,
        full_name: true,
        modality_at_signup: true,
      },
    })
    return row ? toAuthenticatedUserProfile(row) : null
  }

  async findCredentialByUserPublicId(
    userPublicId: string,
  ): Promise<IdentityRegisteredUserCredentialRecord | null> {
    const row = await this.prisma.identityUser.findUnique({
      where: { public_id: userPublicId },
      select: { public_id: true, full_name: true, password_hash: true },
    })
    return row ? toIdentityRegisteredUserCredentialRecord(row) : null
  }

  async applyProfileUpdates(
    userPublicId: string,
    updates: { fullName?: string; passwordHash?: string },
  ): Promise<boolean> {
    const data: { full_name?: string; password_hash?: string } = {}
    if (updates.fullName !== undefined) data.full_name = updates.fullName
    if (updates.passwordHash !== undefined) data.password_hash = updates.passwordHash
    if (Object.keys(data).length === 0) return true

    const res = await this.prisma.identityUser.updateMany({
      where: { public_id: userPublicId },
      data,
    })
    return res.count > 0
  }

  async getPreferredActiveWorkspacePublicId(userPublicId: string): Promise<string | null> {
    const row = await this.prisma.identityUser.findUnique({
      where: { public_id: userPublicId },
      select: { preferred_active_workspace_public_id: true },
    })
    const v = row?.preferred_active_workspace_public_id
    return typeof v === "string" && v.length > 0 ? v : null
  }

  async setPreferredActiveWorkspacePublicId(
    userPublicId: string,
    workspacePublicId: string | null,
  ): Promise<boolean> {
    const res = await this.prisma.identityUser.updateMany({
      where: { public_id: userPublicId },
      data: {
        preferred_active_workspace_public_id: workspacePublicId,
        preferred_active_workspace_updated_at: new Date(),
      },
    })
    return res.count > 0
  }
}
