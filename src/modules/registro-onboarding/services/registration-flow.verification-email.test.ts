import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { IdentityRegistrationIntent } from "../domain/registration-intent.entity.js"
import type { IdentityVerificationChallenge } from "../domain/identity-verification-challenge.entity.js"
import type { AccountLookupPort } from "../integrations/accounts/account-lookup.port.js"
import type { TransactionalEmailPort } from "../integrations/email/transactional-email.port.js"
import type { RegistrationPaymentPort } from "../integrations/payment/payment.port.js"
import type { RegistrationProvisioningPort } from "../integrations/provisioning/provisioning.port.js"
import type { IdentityRegistrationIntentRepository } from "../persistence/registration-intent.repository.js"
import type {
  CreateIdentityVerificationChallengeInput,
  UpdateIdentityVerificationChallengePatch,
  IdentityVerificationChallengeRepository,
} from "../persistence/identity-verification-challenge.repository.js"
import { RegistrationFlowService } from "./registration-flow.service.js"

class MemoryIntentRepo implements IdentityRegistrationIntentRepository {
  constructor(public intent: IdentityRegistrationIntent | null) {}

  async create(): Promise<IdentityRegistrationIntent> {
    throw new Error("unused")
  }

  async findByPublicId(intentPublicId: string): Promise<IdentityRegistrationIntent | null> {
    return this.intent && this.intent.intentPublicId === intentPublicId
      ? structuredClone(this.intent)
      : null
  }

  async findLatestByEmailNormalized(): Promise<IdentityRegistrationIntent | null> {
    throw new Error("unused")
  }

  async updateByPublicId(): Promise<IdentityRegistrationIntent | null> {
    throw new Error("unused")
  }

  async findClaimingWorkspaceCode(): Promise<IdentityRegistrationIntent | null> {
    throw new Error("unused")
  }
}

class MemoryChallengeRepo implements IdentityVerificationChallengeRepository {
  challenges: IdentityVerificationChallenge[] = []

  async create(input: CreateIdentityVerificationChallengeInput): Promise<IdentityVerificationChallenge> {
    const now = new Date()
    const row: IdentityVerificationChallenge = {
      challengePublicId: input.challengePublicId,
      registrationIntentPublicId: input.registrationIntentPublicId,
      emailNormalized: input.emailNormalized,
      codeHash: input.codeHash,
      status: "PENDING",
      expiresAt: input.expiresAt,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      createdAt: now,
      updatedAt: now,
    }
    this.challenges.push(row)
    return structuredClone(row)
  }

  async supersedePendingForIntent(registrationIntentPublicId: string): Promise<number> {
    let n = 0
    for (const c of this.challenges) {
      if (c.registrationIntentPublicId === registrationIntentPublicId && c.status === "PENDING") {
        c.status = "SUPERSEDED"
        n += 1
      }
    }
    return n
  }

  async findByChallengePublicId(): Promise<IdentityVerificationChallenge | null> {
    throw new Error("unused")
  }

  async findLatestPendingChallengeForIntent(
    registrationIntentPublicId: string,
  ): Promise<IdentityVerificationChallenge | null> {
    const pending = this.challenges.filter(
      (c) => c.registrationIntentPublicId === registrationIntentPublicId && c.status === "PENDING",
    )
    if (pending.length === 0) return null
    pending.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return structuredClone(pending[0])
  }

  async updateByChallengePublicId(
    challengePublicId: string,
    patch: UpdateIdentityVerificationChallengePatch,
  ): Promise<IdentityVerificationChallenge | null> {
    const c = this.challenges.find((x) => x.challengePublicId === challengePublicId)
    if (!c) return null
    if (patch.status !== undefined) c.status = patch.status
    if (patch.attemptCount !== undefined) c.attemptCount = patch.attemptCount
    c.updatedAt = new Date()
    return structuredClone(c)
  }
}

const stubAccount: AccountLookupPort = { async isEmailRegistered() {
 return false
} }

const stubPayment: RegistrationPaymentPort = {
  async createCheckoutSession() {
    return { externalRef: "x" }
  },
}

const stubProvisioning: RegistrationProvisioningPort = {
  async provisionPaidRegistration() {
    return {
      userPublicId: "u",
      workspacePublicId: "w",
      membershipPublicId: "m",
      membershipRole: "owner",
    }
  },
}

describe("RegistrationFlowService / verification email", () => {
  it("si falla el envío del OTP, marca el desafío como EXPIRED y devuelve email_delivery_failed", async () => {
    const intentPublicId = randomUUID()
    const now = new Date()
    const intent: IdentityRegistrationIntent = {
      intentPublicId,
      emailNormalized: "reg@test.local",
      status: "EMAIL_COLLECTED",
      expiresAt: new Date(now.getTime() + 3600_000),
      createdAt: now,
      updatedAt: now,
    }
    const intents = new MemoryIntentRepo(intent)
    const challenges = new MemoryChallengeRepo()
    const email: TransactionalEmailPort = {
      async sendRegistrationVerificationEmail() {
        throw new Error("resend unavailable")
      },
      async sendRegistrationPaymentConfirmation() {},
    }
    const flow = new RegistrationFlowService(
      intents,
      challenges,
      stubAccount,
      email,
      stubPayment,
      stubProvisioning,
    )

    const out = await flow.requestVerificationCode(intentPublicId)
    assert.equal(out.sent, false)
    if (!out.sent) {
      assert.equal(out.reason, "email_delivery_failed")
    }
    const latest = await challenges.findLatestPendingChallengeForIntent(intentPublicId)
    assert.equal(latest, null)
    const last = challenges.challenges[challenges.challenges.length - 1]
    assert.equal(last.status, "EXPIRED")
  })
})
