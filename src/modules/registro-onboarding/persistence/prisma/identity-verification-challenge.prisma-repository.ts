import type { PrismaClient } from "@prisma/client"
import type { IdentityVerificationChallenge } from "../../domain/identity-verification-challenge.entity.js"
import type {
  CreateIdentityVerificationChallengeInput,
  IdentityVerificationChallengeRepository,
  UpdateIdentityVerificationChallengePatch,
} from "../identity-verification-challenge.repository.js"

function mapRow(row: {
  public_id: string
  registration_intent_public_id: string
  email_normalized: string
  code_hash: string
  status: IdentityVerificationChallenge["status"]
  expires_at: Date
  attempt_count: number
  max_attempts: number
  created_at: Date
  updated_at: Date
}): IdentityVerificationChallenge {
  return {
    challengePublicId: row.public_id,
    registrationIntentPublicId: row.registration_intent_public_id,
    emailNormalized: row.email_normalized,
    codeHash: row.code_hash,
    status: row.status,
    expiresAt: row.expires_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Desafíos de verificación en PostgreSQL. en el flujo de registro.
 */
export class IdentityVerificationChallengePrismaRepository
  implements IdentityVerificationChallengeRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreateIdentityVerificationChallengeInput,
  ): Promise<IdentityVerificationChallenge> {
    const intent = await this.prisma.identityRegistrationIntent.findUnique({
      where: { public_id: input.registrationIntentPublicId },
      select: { id: true },
    })
    if (!intent) {
      throw new Error(`identity_registration_intent_not_found:${input.registrationIntentPublicId}`)
    }

    const row = await this.prisma.identityVerificationChallenge.create({
      data: {
        public_id: input.challengePublicId,
        registration_intent_id: intent.id,
        registration_intent_public_id: input.registrationIntentPublicId,
        email_normalized: input.emailNormalized,
        code_hash: input.codeHash,
        status: "PENDING",
        expires_at: input.expiresAt,
        attempt_count: 0,
        max_attempts: input.maxAttempts,
      },
    })
    return mapRow(row)
  }

  async supersedePendingForIntent(registrationIntentPublicId: string): Promise<number> {
    const res = await this.prisma.identityVerificationChallenge.updateMany({
      where: {
        registration_intent_public_id: registrationIntentPublicId,
        status: "PENDING",
      },
      data: { status: "SUPERSEDED" },
    })
    return res.count
  }

  async findByChallengePublicId(
    challengePublicId: string,
  ): Promise<IdentityVerificationChallenge | null> {
    const row = await this.prisma.identityVerificationChallenge.findUnique({
      where: { public_id: challengePublicId },
    })
    return row ? mapRow(row) : null
  }

  async findLatestPendingChallengeForIntent(
    registrationIntentPublicId: string,
  ): Promise<IdentityVerificationChallenge | null> {
    const row = await this.prisma.identityVerificationChallenge.findFirst({
      where: {
        registration_intent_public_id: registrationIntentPublicId,
        status: "PENDING",
      },
      orderBy: { created_at: "desc" },
    })
    return row ? mapRow(row) : null
  }

  async updateByChallengePublicId(
    challengePublicId: string,
    patch: UpdateIdentityVerificationChallengePatch,
  ): Promise<IdentityVerificationChallenge | null> {
    const data: { status?: IdentityVerificationChallenge["status"]; attempt_count?: number } =
      {}
    if (patch.status !== undefined) data.status = patch.status
    if (patch.attemptCount !== undefined) data.attempt_count = patch.attemptCount

    try {
      const row = await this.prisma.identityVerificationChallenge.update({
        where: { public_id: challengePublicId },
        data,
      })
      return mapRow(row)
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
}
