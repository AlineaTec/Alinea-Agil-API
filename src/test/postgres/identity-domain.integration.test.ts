/**
 * Integración PostgreSQL — dominio identity (repos Prisma).
 * Requiere Docker. Ver npm run test:postgres:identity
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { AuthSessionPrismaRepository } from "../../modules/login-session/persistence/prisma/auth-session.prisma-repository.js"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { PasswordResetTokenPrismaRepository } from "../../modules/login-session/persistence/prisma/password-reset-token.prisma-repository.js"
import { IdentityVerificationChallengePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/identity-verification-challenge.prisma-repository.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { defaultIntentExpiry } from "../../modules/registro-onboarding/services/registration-intent-ttl.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

const USER_ID = "10000000-0000-4000-8000-000000000001"
const INTENT_ID = "20000000-0000-4000-8000-000000000002"
const EMAIL = "identity-pg@test.dev"

describe("Dominio identity — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext
  let users: IdentityUserForAuthPrismaRepository
  let sessions: AuthSessionPrismaRepository
  let resetTokens: PasswordResetTokenPrismaRepository
  let intents: IdentityRegistrationIntentPrismaRepository
  let challenges: IdentityVerificationChallengePrismaRepository

  before(async () => {
    ctx = await startPostgresTestEnvironment()
    users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
    sessions = new AuthSessionPrismaRepository(ctx.prisma)
    resetTokens = new PasswordResetTokenPrismaRepository(ctx.prisma)
    intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
    challenges = new IdentityVerificationChallengePrismaRepository(ctx.prisma)
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("crea y lee identity_users con unicidad de email", async () => {
    const intent = await intents.create({
      intentPublicId: INTENT_ID,
      emailNormalized: EMAIL,
      status: "EMAIL_COLLECTED",
      expiresAt: defaultIntentExpiry(),
    })
    assert.equal(intent.intentPublicId, INTENT_ID)

    await users.createRegisteredUser({
      publicId: USER_ID,
      emailNormalized: EMAIL,
      fullName: "Test User",
      passwordHash: "hash-v1",
      modalityAtSignup: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })

    const auth = await users.findByEmailNormalized(EMAIL)
    assert.ok(auth)
    assert.equal(auth.userPublicId, USER_ID)

    await assert.rejects(
      () =>
        users.createRegisteredUser({
          publicId: randomUUID(),
          emailNormalized: EMAIL,
          fullName: "Dup",
          passwordHash: "x",
          modalityAtSignup: "individual",
          sourceRegistrationIntentPublicId: INTENT_ID,
        }),
      (err: unknown) =>
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002",
    )
  })

  it("crea sesiones auth ligadas al usuario y valida por token_hash", async () => {
    const tokenHash = `session-hash-${randomUUID()}`
    const sessionPublicId = randomUUID()
    const expiresAt = new Date(Date.now() + 60_000)

    const session = await sessions.create({
      sessionPublicId,
      userPublicId: USER_ID,
      tokenHash,
      expiresAt,
    })
    assert.equal(session.sessionPublicId, sessionPublicId)
    assert.equal(session.userPublicId, USER_ID)

    const valid = await sessions.findValidByTokenHash(tokenHash, new Date())
    assert.ok(valid)
    assert.equal(valid?.sessionPublicId, sessionPublicId)

    const expired = await sessions.findValidByTokenHash(
      tokenHash,
      new Date(expiresAt.getTime() + 1),
    )
    assert.equal(expired, null)

    await sessions.deleteAllByUserPublicId(USER_ID)
    const afterRevoke = await sessions.findValidByTokenHash(tokenHash, new Date())
    assert.equal(afterRevoke, null)
  })

  it("password reset: unicidad de token_hash y relación con usuario", async () => {
    const tokenHash = `reset-hash-${randomUUID()}`
    const expiresAt = new Date(Date.now() + 3600_000)

    await resetTokens.insert({
      tokenHash,
      userPublicId: USER_ID,
      emailNormalized: EMAIL,
      expiresAt,
    })

    const row = await resetTokens.findValidUnused(tokenHash, new Date())
    assert.ok(row)
    assert.equal(row.userPublicId, USER_ID)

    await assert.rejects(
      () =>
        resetTokens.insert({
          tokenHash,
          userPublicId: USER_ID,
          emailNormalized: EMAIL,
          expiresAt,
        }),
      (err: unknown) =>
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002",
    )

    assert.equal(await resetTokens.markUsed(tokenHash, new Date()), true)
    assert.equal(await resetTokens.findValidUnused(tokenHash, new Date()), null)
  })

  it("registration intents y verification challenges con relación", async () => {
    const intentPublicId = randomUUID()
    const intent = await intents.create({
      intentPublicId,
      emailNormalized: `other-${EMAIL}`,
      status: "EMAIL_COLLECTED",
      expiresAt: defaultIntentExpiry(),
    })
    assert.equal(intent.status, "EMAIL_COLLECTED")

    const challengePublicId = randomUUID()
    const challenge = await challenges.create({
      challengePublicId,
      registrationIntentPublicId: intentPublicId,
      emailNormalized: intent.emailNormalized,
      codeHash: "code-hash-1",
      expiresAt: defaultIntentExpiry(),
      maxAttempts: 5,
    })
    assert.equal(challenge.status, "PENDING")
    assert.equal(challenge.registrationIntentPublicId, intentPublicId)

    const superseded = await challenges.supersedePendingForIntent(intentPublicId)
    assert.equal(superseded, 1)

    const pending = await challenges.findLatestPendingChallengeForIntent(intentPublicId)
    assert.equal(pending, null)

    const loaded = await challenges.findByChallengePublicId(challengePublicId)
    assert.equal(loaded?.status, "SUPERSEDED")
  })

  it("workspace_code único en intents que reclaman código", async () => {
    const code = `slug-${Date.now()}`
    const asOf = new Date()
    const expiresAt = new Date(Date.now() + 86_400_000)

    await intents.updateByPublicId(INTENT_ID, {
      status: "WORKSPACE_PROPOSED",
      workspaceCode: code,
      expiresAt,
    })

    const claiming = await intents.findClaimingWorkspaceCode(code, asOf)
    assert.ok(claiming)
    assert.equal(claiming.intentPublicId, INTENT_ID)

    await assert.rejects(
      () =>
        intents.create({
          intentPublicId: randomUUID(),
          emailNormalized: "another@test.dev",
          status: "WORKSPACE_PROPOSED",
          expiresAt,
        }).then((row) =>
          intents.updateByPublicId(row.intentPublicId, {
            workspaceCode: code,
            status: "WORKSPACE_PROPOSED",
          }),
        ),
      (err: unknown) =>
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002",
    )
  })
})
