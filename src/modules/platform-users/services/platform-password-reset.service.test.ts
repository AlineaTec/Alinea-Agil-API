import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, it } from "node:test"
import type { PlatformUserState } from "../domain/platform-user.entity.js"
import type { PlatformAccessSessionRepository } from "../persistence/platform-access-session.repository.js"
import type {
  PlatformPasswordResetTokenRepository,
  PlatformPasswordResetTokenRow,
} from "../persistence/platform-password-reset-token.repository.js"
import type { PlatformUserRepository } from "../persistence/platform-user.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { hashPasswordResetOpaqueToken } from "../../login-session/services/password-reset-token-hash.js"
import { hashPlatformPassword, verifyPlatformPassword } from "./platform-password.js"
import { PlatformPasswordResetService } from "./platform-password-reset.service.js"

function baseUser(over: Partial<PlatformUserState> = {}): PlatformUserState {
  const now = new Date()
  const { salt, hash } = hashPlatformPassword("oldpassword12")
  return {
    platformUserId: randomUUID(),
    email: `admin-${randomUUID().slice(0, 8)}@test.local`,
    displayName: "Admin Test",
    role: "platform_super_admin",
    status: "active",
    mfaStatus: "not_enrolled",
    mfaTotpSecretBase32: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    invitationNonceHash: null,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

class MemUsers implements PlatformUserRepository {
  users: PlatformUserState[] = []

  async insert(state: PlatformUserState): Promise<void> {
    this.users.push(structuredClone(state))
  }

  async save(state: PlatformUserState): Promise<void> {
    const idx = this.users.findIndex((u) => u.platformUserId === state.platformUserId)
    if (idx >= 0) this.users[idx] = structuredClone(state)
  }

  async findById(platformUserId: string): Promise<PlatformUserState | null> {
    const u = this.users.find((x) => x.platformUserId === platformUserId)
    return u ? structuredClone(u) : null
  }

  async findByEmail(email: string): Promise<PlatformUserState | null> {
    const u = this.users.find((x) => x.email === email.trim().toLowerCase())
    return u ? structuredClone(u) : null
  }

  async listAll(): Promise<PlatformUserState[]> {
    return this.users.map((u) => structuredClone(u))
  }

  async countActiveByRole(): Promise<number> {
    return 0
  }

  async countAll(): Promise<number> {
    return this.users.length
  }
}

class MemResetTokens implements PlatformPasswordResetTokenRepository {
  rows: PlatformPasswordResetTokenRow[] = []

  async insert(row: Omit<PlatformPasswordResetTokenRow, "usedAt">): Promise<void> {
    this.rows.push({ ...row, usedAt: null })
  }

  async findValidUnused(
    tokenHash: string,
    asOf: Date,
  ): Promise<{ platformUserId: string; emailNormalized: string } | null> {
    const row = this.rows.find(
      (r) => r.tokenHash === tokenHash && r.usedAt === null && r.expiresAt.getTime() > asOf.getTime(),
    )
    return row ? { platformUserId: row.platformUserId, emailNormalized: row.emailNormalized } : null
  }

  async markUsed(tokenHash: string, at: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash && r.usedAt === null)
    if (!row) return false
    row.usedAt = at
    return true
  }

  async deletePendingForUser(platformUserId: string): Promise<void> {
    this.rows = this.rows.filter((r) => !(r.platformUserId === platformUserId && r.usedAt === null))
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.rows = this.rows.filter((r) => r.tokenHash !== tokenHash)
  }
}

class MemSessions implements PlatformAccessSessionRepository {
  deletedUserIds: string[] = []

  async create(): Promise<never> {
    throw new Error("unused")
  }

  async findValidByTokenHash(): Promise<null> {
    return null
  }

  async deleteBySessionPublicId(): Promise<void> {}

  async deleteAllByPlatformUserId(platformUserId: string): Promise<void> {
    this.deletedUserIds.push(platformUserId)
  }
}

class FakeEmail implements Pick<TransactionalEmailService, "sendPlatformAdminPasswordReset"> {
  sent: { toEmail: string; resetUrl: string }[] = []

  async sendPlatformAdminPasswordReset(params: {
    toEmail: string
    displayName: string | null
    resetUrl: string
  }): Promise<void> {
    this.sent.push({ toEmail: params.toEmail, resetUrl: params.resetUrl })
  }
}

describe("PlatformPasswordResetService", () => {
  const prevAdminUrl = process.env.PLATFORM_ADMIN_PUBLIC_BASE_URL

  beforeEach(() => {
    process.env.PLATFORM_ADMIN_PUBLIC_BASE_URL = "https://admin.test.local"
  })

  afterEach(() => {
    if (prevAdminUrl === undefined) delete process.env.PLATFORM_ADMIN_PUBLIC_BASE_URL
    else process.env.PLATFORM_ADMIN_PUBLIC_BASE_URL = prevAdminUrl
  })

  it("requestResetForEmail sends email and stores token when user is eligible", async () => {
    const users = new MemUsers()
    const user = baseUser()
    await users.insert(user)
    const tokens = new MemResetTokens()
    const sessions = new MemSessions()
    const email = new FakeEmail()
    const svc = new PlatformPasswordResetService(users, tokens, sessions, email as TransactionalEmailService)

    await svc.requestResetForEmail(user.email)

    assert.equal(email.sent.length, 1)
    assert.equal(email.sent[0]?.toEmail, user.email)
    assert.match(email.sent[0]?.resetUrl ?? "", /^https:\/\/admin\.test\.local\/forgot-password\?token=/)
    assert.equal(tokens.rows.length, 1)
    assert.equal(tokens.rows[0]?.platformUserId, user.platformUserId)
  })

  it("requestResetForEmail is silent when user does not exist", async () => {
    const users = new MemUsers()
    const tokens = new MemResetTokens()
    const sessions = new MemSessions()
    const email = new FakeEmail()
    const svc = new PlatformPasswordResetService(users, tokens, sessions, email as TransactionalEmailService)

    await svc.requestResetForEmail("missing@test.local")

    assert.equal(email.sent.length, 0)
    assert.equal(tokens.rows.length, 0)
  })

  it("confirmWithToken updates password, marks token used and revokes sessions", async () => {
    const users = new MemUsers()
    const user = baseUser()
    await users.insert(user)
    const tokens = new MemResetTokens()
    const sessions = new MemSessions()
    const email = new FakeEmail()
    const svc = new PlatformPasswordResetService(users, tokens, sessions, email as TransactionalEmailService)

    const rawToken = randomBytes(32).toString("base64url")
    await tokens.insert({
      tokenHash: hashPasswordResetOpaqueToken(rawToken),
      platformUserId: user.platformUserId,
      emailNormalized: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const result = await svc.confirmWithToken(rawToken, "newpassword99")
    assert.equal(result.ok, true)

    const updated = await users.findById(user.platformUserId)
    assert.ok(updated?.passwordSalt && updated.passwordHash)
    assert.equal(verifyPlatformPassword("newpassword99", updated.passwordSalt, updated.passwordHash), true)
    assert.ok(tokens.rows[0]?.usedAt)
    assert.deepEqual(sessions.deletedUserIds, [user.platformUserId])
  })

  it("confirmWithToken rejects weak password", async () => {
    const users = new MemUsers()
    const user = baseUser()
    await users.insert(user)
    const tokens = new MemResetTokens()
    const sessions = new MemSessions()
    const svc = new PlatformPasswordResetService(users, tokens, sessions, null)

    const rawToken = randomBytes(32).toString("base64url")
    await tokens.insert({
      tokenHash: hashPasswordResetOpaqueToken(rawToken),
      platformUserId: user.platformUserId,
      emailNormalized: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const result = await svc.confirmWithToken(rawToken, "short")
    assert.deepEqual(result, { ok: false, code: "invalid_new_password" })
  })
})
