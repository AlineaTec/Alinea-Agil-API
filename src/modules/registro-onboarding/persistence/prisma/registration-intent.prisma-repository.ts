import type { Prisma, PrismaClient } from "@prisma/client"
import type {
  CreateIdentityRegistrationIntentInput,
  IdentityRegistrationIntent,
  UpdateIdentityRegistrationIntentPatch,
} from "../../domain/registration-intent.entity.js"
import { REGISTRATION_STATUSES_CLAIMING_WORKSPACE_CODE } from "../../domain/workspace-identity.policy.js"
import type { IdentityRegistrationIntentRepository } from "../registration-intent.repository.js"
import {
  identityRegistrationIntentFromPrisma,
  registrationIntentPatchToPrismaData,
  registrationIntentUnsetKeysToNull,
} from "./registration-intent.prisma-mapper.js"

/**
 * Intentos de registro en PostgreSQL. 
 */
export class IdentityRegistrationIntentPrismaRepository
  implements IdentityRegistrationIntentRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateIdentityRegistrationIntentInput): Promise<IdentityRegistrationIntent> {
    const row = await this.prisma.identityRegistrationIntent.create({
      data: {
        public_id: input.intentPublicId,
        email_normalized: input.emailNormalized,
        status: input.status,
        expires_at: input.expiresAt,
      },
    })
    return identityRegistrationIntentFromPrisma(row)
  }

  async findByPublicId(intentPublicId: string): Promise<IdentityRegistrationIntent | null> {
    const row = await this.prisma.identityRegistrationIntent.findUnique({
      where: { public_id: intentPublicId },
    })
    return row ? identityRegistrationIntentFromPrisma(row) : null
  }

  async findLatestByEmailNormalized(
    emailNormalized: string,
  ): Promise<IdentityRegistrationIntent | null> {
    const row = await this.prisma.identityRegistrationIntent.findFirst({
      where: { email_normalized: emailNormalized },
      orderBy: { updated_at: "desc" },
    })
    return row ? identityRegistrationIntentFromPrisma(row) : null
  }

  async updateByPublicId(
    intentPublicId: string,
    patch: UpdateIdentityRegistrationIntentPatch,
    opts?: { unset?: string[] },
  ): Promise<IdentityRegistrationIntent | null> {
    const setData = registrationIntentPatchToPrismaData(patch)
    const unsetData = opts?.unset?.length
      ? registrationIntentUnsetKeysToNull(opts.unset)
      : {}
    const data = { ...setData, ...unsetData } as Prisma.IdentityRegistrationIntentUpdateInput

    try {
      const row = await this.prisma.identityRegistrationIntent.update({
        where: { public_id: intentPublicId },
        data,
      })
      return identityRegistrationIntentFromPrisma(row)
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        return null
      }
      throw err
    }
  }

  async findClaimingWorkspaceCode(
    normalizedCode: string,
    asOf: Date,
  ): Promise<IdentityRegistrationIntent | null> {
    const row = await this.prisma.identityRegistrationIntent.findFirst({
      where: {
        workspace_code: normalizedCode,
        status: { in: [...REGISTRATION_STATUSES_CLAIMING_WORKSPACE_CODE] },
        expires_at: { gt: asOf },
      },
    })
    return row ? identityRegistrationIntentFromPrisma(row) : null
  }
}
