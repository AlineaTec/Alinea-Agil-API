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
import { hashOtpCodeForStorage } from "./verification-otp.js"

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

  async updateByPublicId(
    intentPublicId: string,
    patch: Partial<
      Pick<IdentityRegistrationIntent, "status" | "expiresAt" | "updatedAt">
    >,
  ): Promise<IdentityRegistrationIntent | null> {
    if (!this.intent || this.intent.intentPublicId !== intentPublicId) {
      return null
    }
    if (patch.status !== undefined) this.intent.status = patch.status
    if (patch.expiresAt !== undefined) this.intent.expiresAt = patch.expiresAt
    this.intent.updatedAt = patch.updatedAt ?? new Date()
    return structuredClone(this.intent)
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

function buildFlow(
  intent: IdentityRegistrationIntent,
  emailSend: TransactionalEmailPort["sendRegistrationVerificationEmail"],
) {
  const intents = new MemoryIntentRepo(intent)
  const challenges = new MemoryChallengeRepo()
  const email: TransactionalEmailPort = {
    async sendRegistrationVerificationEmail(args) {
      return emailSend(args)
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
  return { flow, challenges }
}

describe("RegistrationFlowService / verification email", () => {
  it("reutiliza un desafío PENDING vigente si no es reemisión (evita doble OTP)", async () => {
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
    let sendCount = 0
    let lastCode = ""
    const { flow, challenges } = buildFlow(intent, async ({ codeOrLink }) => {
      sendCount += 1
      lastCode = codeOrLink
    })

    const first = await flow.requestVerificationCode(intentPublicId)
    const second = await flow.requestVerificationCode(intentPublicId)

    assert.equal(first.sent, true)
    assert.equal(second.sent, true)
    assert.equal(sendCount, 1)
    assert.equal(challenges.challenges.filter((c) => c.status === "PENDING").length, 1)

    const confirm = await flow.submitVerificationCode(intentPublicId, lastCode)
    assert.equal(confirm.verified, true)
    if (confirm.verified) {
      assert.equal(confirm.intentStatus, "EMAIL_VERIFIED")
    }
  })

  it("con reissue=true invalida el desafío previo y emite uno nuevo", async () => {
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
    const sentCodes: string[] = []
    const { flow, challenges } = buildFlow(intent, async ({ codeOrLink }) => {
      sentCodes.push(codeOrLink)
    })

    await flow.requestVerificationCode(intentPublicId)
    await flow.requestVerificationCode(intentPublicId, { reissue: true })

    assert.equal(sentCodes.length, 2)
    assert.notEqual(sentCodes[0], sentCodes[1])
    assert.equal(
      challenges.challenges.filter((c) => c.status === "SUPERSEDED").length,
      1,
    )

    const pending = await challenges.findLatestPendingChallengeForIntent(intentPublicId)
    assert.ok(pending)
    assert.equal(pending.codeHash, hashOtpCodeForStorage(sentCodes[1]))
  })

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
    const { flow, challenges } = buildFlow(intent, async () => {
      throw new Error("resend unavailable")
    })

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
