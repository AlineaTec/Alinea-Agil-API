import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { authenticator } from "otplib"
import type { AuthenticatedPlatformAccessSession } from "../domain/platform-access-session.entity.js"
import type { PlatformUserState } from "../domain/platform-user.entity.js"
import type {
  CreatePlatformAccessSessionInput,
  PlatformAccessSessionRepository,
} from "../persistence/platform-access-session.repository.js"
import type { PlatformUserRepository } from "../persistence/platform-user.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { hashPlatformPassword } from "./platform-password.js"
import { PlatformAuthService } from "./platform-auth.service.js"
import { PlatformMfaTotpService } from "./platform-mfa-totp.service.js"

authenticator.options = { window: 1 }

function baseUser(over: Partial<PlatformUserState> = {}): PlatformUserState {
  const now = new Date()
  const { salt, hash } = hashPlatformPassword("longpassword1")
  return {
    platformUserId: randomUUID(),
    email: `u-${randomUUID().slice(0, 8)}@test.local`,
    displayName: "Visible Name",
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

  async insert(): Promise<void> {
    throw new Error("unused")
  }
  async save(): Promise<void> {
    throw new Error("unused")
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
    throw new Error("unused")
  }
  async countActiveByRole(): Promise<number> {
    throw new Error("unused")
  }
  async countAll(): Promise<number> {
    throw new Error("unused")
  }
}

class MemSessions implements PlatformAccessSessionRepository {
  stored: CreatePlatformAccessSessionInput[] = []

  async create(input: CreatePlatformAccessSessionInput): Promise<AuthenticatedPlatformAccessSession> {
    this.stored.push(input)
    return {
      sessionPublicId: input.sessionPublicId,
      platformUserId: input.platformUserId,
      expiresAt: input.expiresAt,
    }
  }

  async findValidByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticatedPlatformAccessSession | null> {
    const hit = this.stored.find((s) => s.tokenHash === tokenHash && s.expiresAt > now)
    if (!hit) return null
    return {
      sessionPublicId: hit.sessionPublicId,
      platformUserId: hit.platformUserId,
      expiresAt: hit.expiresAt,
    }
  }

  async deleteBySessionPublicId(): Promise<void> {}

  async deleteAllByPlatformUserId(): Promise<void> {}
}

type SessionStartedPayload = Parameters<
  TransactionalEmailService["sendPlatformAdminSessionStarted"]
>[0]

function recordingTransactionalEmail(): {
  tx: TransactionalEmailService
  sessionStartedCalls: SessionStartedPayload[]
} {
  const sessionStartedCalls: SessionStartedPayload[] = []
  const tx = {
    async sendPlatformAdminSessionStarted(p: SessionStartedPayload): Promise<void> {
      sessionStartedCalls.push(p)
    },
  } as unknown as TransactionalEmailService
  return { tx, sessionStartedCalls }
}

describe("PlatformAuthService / nueva sesión y correo", () => {
  it("login exitoso dispara notificación con IP y user-agent", async () => {
    const users = new MemUsers()
    const sessions = new MemSessions()
    const mfa = new PlatformMfaTotpService()
    const { tx, sessionStartedCalls } = recordingTransactionalEmail()
    const auth = new PlatformAuthService(users, sessions, mfa, tx)
    const u = baseUser({ email: "login@test.local" })
    users.users.push(u)

    const result = await auth.login("login@test.local", "longpassword1", undefined, {
      clientIp: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0",
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(sessionStartedCalls.length, 1)
    const call = sessionStartedCalls[0]
    assert.equal(call.toEmail, "login@test.local")
    assert.equal(call.clientIp, "203.0.113.10")
    assert.match(call.userAgent ?? "", /Firefox/)
    assert.equal(call.greetingName, "Visible Name")
    assert.equal(sessions.stored.length, 1)
  })

  it("login fallido no dispara correo ni crea sesión", async () => {
    const users = new MemUsers()
    const sessions = new MemSessions()
    const mfa = new PlatformMfaTotpService()
    const { tx, sessionStartedCalls } = recordingTransactionalEmail()
    const auth = new PlatformAuthService(users, sessions, mfa, tx)
    const u = baseUser({ email: "bad@test.local" })
    users.users.push(u)

    const result = await auth.login("bad@test.local", "wrongpassword", undefined, {
      clientIp: "1.1.1.1",
    })

    assert.equal(result.ok, false)
    assert.equal(sessions.stored.length, 0)
    assert.equal(sessionStartedCalls.length, 0)
  })

  it("mfa_required no crea sesión ni envía correo", async () => {
    const users = new MemUsers()
    const sessions = new MemSessions()
    const mfa = new PlatformMfaTotpService()
    const { tx, sessionStartedCalls } = recordingTransactionalEmail()
    const auth = new PlatformAuthService(users, sessions, mfa, tx)
    const secret = authenticator.generateSecret()
    const u = baseUser({
      email: "mfa@test.local",
      mfaStatus: "enrolled",
      mfaTotpSecretBase32: secret,
    })
    users.users.push(u)

    const result = await auth.login("mfa@test.local", "longpassword1", undefined, {})

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.reason, "mfa_required")
    assert.equal(sessions.stored.length, 0)
    assert.equal(sessionStartedCalls.length, 0)
  })

  it("login con MFA enrolado y código válido dispara una notificación", async () => {
    const users = new MemUsers()
    const sessions = new MemSessions()
    const mfa = new PlatformMfaTotpService()
    const { tx, sessionStartedCalls } = recordingTransactionalEmail()
    const auth = new PlatformAuthService(users, sessions, mfa, tx)
    const secret = authenticator.generateSecret()
    const u = baseUser({
      email: "mfaok@test.local",
      mfaStatus: "enrolled",
      mfaTotpSecretBase32: secret,
    })
    users.users.push(u)
    const code = authenticator.generate(secret)
    const result = await auth.login("mfaok@test.local", "longpassword1", code, {
      clientIp: "::1",
    })
    assert.equal(result.ok, true)
    assert.equal(sessionStartedCalls.length, 1)
    assert.equal(sessions.stored.length, 1)
  })

  it("fallo de envío de correo no rompe login exitoso", async () => {
    const users = new MemUsers()
    const sessions = new MemSessions()
    const mfa = new PlatformMfaTotpService()
    const tx = {
      async sendPlatformAdminSessionStarted(): Promise<void> {
        throw new Error("resend down")
      },
    } as unknown as TransactionalEmailService
    const auth = new PlatformAuthService(users, sessions, mfa, tx)
    const u = baseUser({ email: "ok@test.local" })
    users.users.push(u)

    const result = await auth.login("ok@test.local", "longpassword1", undefined, {
      clientIp: "10.0.0.1",
    })

    assert.equal(result.ok, true)
    assert.equal(sessions.stored.length, 1)
  })

  it("resolver sesión existente no envía correo de nueva sesión", async () => {
    const users = new MemUsers()
    const sessions = new MemSessions()
    const mfa = new PlatformMfaTotpService()
    const { tx, sessionStartedCalls } = recordingTransactionalEmail()
    const auth = new PlatformAuthService(users, sessions, mfa, tx)
    const u = baseUser({ email: "reuse@test.local" })
    users.users.push(u)

    const loggedIn = await auth.login("reuse@test.local", "longpassword1", undefined, {})
    assert.equal(loggedIn.ok, true)
    if (!loggedIn.ok) return
    assert.equal(sessionStartedCalls.length, 1)
    sessionStartedCalls.length = 0

    const resolved = await auth.resolveFromAuthorizationHeader(`Bearer ${loggedIn.accessToken}`)
    assert.equal(resolved.ok, true)
    assert.equal(sessionStartedCalls.length, 0)
  })
})
