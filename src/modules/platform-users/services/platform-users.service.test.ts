import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, it } from "node:test"
import { authenticator } from "otplib"
import type { PlatformRole } from "../domain/platform-role.js"
import type { PlatformSessionContext } from "../domain/platform-session.context.js"
import type { PlatformUserState } from "../domain/platform-user.entity.js"
import {
  PlatformUserConflictError,
  PlatformUserForbiddenError,
  PlatformUserInvariantError,
} from "../domain/platform-user.errors.js"
import type { PlatformAuditRepository } from "../persistence/platform-audit.repository.js"
import type { PlatformUserRepository } from "../persistence/platform-user.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { PlatformAuditService } from "./platform-audit.service.js"
import { PlatformMfaTotpService } from "./platform-mfa-totp.service.js"
import { PlatformUsersService } from "./platform-users.service.js"

authenticator.options = { window: 1 }

function baseUser(over: Partial<PlatformUserState> = {}): PlatformUserState {
  const now = new Date()
  return {
    platformUserId: randomUUID(),
    email: `u-${randomUUID().slice(0, 8)}@test.local`,
    displayName: null,
    role: "platform_super_admin",
    status: "active",
    mfaStatus: "enrolled",
    mfaTotpSecretBase32: "TESTSECRET",
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    invitationNonceHash: null,
    passwordSalt: "s",
    passwordHash: "h",
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

class MemoryPlatformUserRepository implements PlatformUserRepository {
  users: PlatformUserState[] = []

  async insert(state: PlatformUserState): Promise<void> {
    this.users.push(structuredClone(state))
  }

  async save(state: PlatformUserState): Promise<void> {
    const i = this.users.findIndex((u) => u.platformUserId === state.platformUserId)
    if (i === -1) throw new Error("not_found")
    this.users[i] = structuredClone(state)
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
    return structuredClone(this.users)
  }

  async countActiveByRole(role: PlatformRole): Promise<number> {
    return this.users.filter((u) => u.role === role && u.status === "active").length
  }

  async countAll(): Promise<number> {
    return this.users.length
  }
}

class MemoryAuditRepository implements PlatformAuditRepository {
  events: Array<{
    action: string
    actorPlatformUserId: string
    targetPlatformUserId: string
  }> = []

  async append(
    r: Parameters<PlatformAuditRepository["append"]>[0],
  ): Promise<void> {
    this.events.push({
      action: r.action,
      actorPlatformUserId: r.actorPlatformUserId,
      targetPlatformUserId: r.targetPlatformUserId,
    })
  }
}

function superSession(id = "super-1"): PlatformSessionContext {
  return {
    platformUserId: id,
    email: "super@test.local",
    role: "platform_super_admin",
  }
}

describe("PlatformUsersService", () => {
  let users: MemoryPlatformUserRepository
  let auditRepo: MemoryAuditRepository
  let service: PlatformUsersService
  let mfa: PlatformMfaTotpService

  beforeEach(() => {
    users = new MemoryPlatformUserRepository()
    auditRepo = new MemoryAuditRepository()
    mfa = new PlatformMfaTotpService()
    service = new PlatformUsersService(users, new PlatformAuditService(auditRepo), mfa)
    delete process.env.PLATFORM_MFA_MAX_FAILED
    delete process.env.PLATFORM_MFA_LOCKOUT_MINUTES
  })

  afterEach(() => {
    delete process.env.PLATFORM_MFA_MAX_FAILED
    delete process.env.PLATFORM_MFA_LOCKOUT_MINUTES
  })

  it("patchMe updates displayName and audits", async () => {
    await users.insert(
      baseUser({
        platformUserId: "self-1",
        email: "me@test.local",
        role: "platform_operator",
        status: "active",
        displayName: null,
      }),
    )
    const sess: PlatformSessionContext = {
      platformUserId: "self-1",
      email: "me@test.local",
      role: "platform_operator",
    }
    const pub = await service.patchMe(sess, { displayName: "Visible" })
    assert.equal(pub.displayName, "Visible")
    const row = await users.findById("self-1")
    assert.equal(row!.displayName, "Visible")
    assert.ok(auditRepo.events.some((e) => e.action === "platform_user.profile_updated"))
  })

  it("getMe devuelve email completo al auditor sobre sí mismo", async () => {
    await users.insert(
      baseUser({
        platformUserId: "aud-self",
        email: "aud.secret@test.local",
        role: "platform_auditor",
        status: "active",
      }),
    )
    const sess: PlatformSessionContext = {
      platformUserId: "aud-self",
      email: "aud.secret@test.local",
      role: "platform_auditor",
    }
    const me = await service.getMe(sess)
    assert.equal(me.email, "aud.secret@test.local")
  })

  it("invite creates pending_activation user and audits", async () => {
    await users.insert(baseUser({ platformUserId: "super-1", email: "super@test.local" }))
    const out = await service.invite(superSession(), {
      email: "new@corp.test",
      role: "platform_operator",
      displayName: "Op",
    })
    assert.equal(out.user.status, "pending_activation")
    assert.equal(out.user.role, "platform_operator")
    assert.ok(out.invitationNonce.length > 8)
    const row = await users.findByEmail("new@corp.test")
    assert.ok(row)
    assert.equal(row!.mfaStatus, "not_enrolled")
    assert.ok(auditRepo.events.some((e) => e.action === "platform_user.invited"))
  })

  it("changeRole updates role and audits", async () => {
    await users.insert(
      baseUser({
        platformUserId: "super-1",
        email: "super@test.local",
        status: "active",
        role: "platform_super_admin",
      }),
    )
    const target = baseUser({
      platformUserId: "u2",
      email: "op@test.local",
      role: "platform_operator",
      status: "active",
    })
    await users.insert(target)
    const pub = await service.changeRole(superSession(), "u2", "platform_auditor")
    assert.equal(pub.role, "platform_auditor")
    const persisted = await users.findById("u2")
    assert.equal(persisted!.role, "platform_auditor")
    assert.ok(auditRepo.events.some((e) => e.action === "platform_user.role_changed"))
  })

  it("blocks deactivate when sole active super admin", async () => {
    await users.insert(
      baseUser({
        platformUserId: "only-super",
        email: "only@test.local",
        role: "platform_super_admin",
        status: "active",
      }),
    )
    await assert.rejects(
      () => service.deactivate(superSession("only-super"), "only-super"),
      (e: unknown) => e instanceof PlatformUserConflictError && e.code === "LAST_SUPER_ADMIN",
    )
  })

  it("blocks role change away from super when sole active super admin", async () => {
    await users.insert(
      baseUser({
        platformUserId: "only-super",
        email: "only@test.local",
        role: "platform_super_admin",
        status: "active",
      }),
    )
    await assert.rejects(
      () => service.changeRole(superSession("only-super"), "only-super", "platform_operator"),
      (e: unknown) => e instanceof PlatformUserConflictError && e.code === "LAST_SUPER_ADMIN",
    )
  })

  it("platform_operator cannot invite", async () => {
    await users.insert(
      baseUser({
        platformUserId: "op-1",
        email: "op@test.local",
        role: "platform_operator",
        status: "active",
      }),
    )
    const sess: PlatformSessionContext = {
      platformUserId: "op-1",
      email: "op@test.local",
      role: "platform_operator",
    }
    await assert.rejects(
      () => service.invite(sess, { email: "x@test.local", role: "platform_auditor" }),
      (e: unknown) => e instanceof PlatformUserForbiddenError,
    )
  })

  it("platform_auditor cannot deactivate", async () => {
    await users.insert(
      baseUser({
        platformUserId: "aud-1",
        email: "aud@test.local",
        role: "platform_auditor",
        status: "active",
      }),
    )
    await users.insert(
      baseUser({
        platformUserId: "victim",
        email: "v@test.local",
        role: "platform_operator",
        status: "active",
      }),
    )
    const sess: PlatformSessionContext = {
      platformUserId: "aud-1",
      email: "aud@test.local",
      role: "platform_auditor",
    }
    await assert.rejects(
      () => service.deactivate(sess, "victim"),
      (e: unknown) => e instanceof PlatformUserForbiddenError,
    )
  })

  it("activate requires enrolled MFA", async () => {
    await users.insert(
      baseUser({
        platformUserId: "super-1",
        email: "super@test.local",
        role: "platform_super_admin",
        status: "active",
      }),
    )
    const invited = await service.invite(superSession(), {
      email: "pend@test.local",
      role: "platform_operator",
    })
    await assert.rejects(
      () => service.activate(superSession(), invited.user.platformUserId),
      (e: unknown) => e instanceof PlatformUserConflictError && e.code === "MFA_REQUIRED",
    )
  })

  it("MFA enrollment then activate reaches active", async () => {
    await users.insert(
      baseUser({
        platformUserId: "super-1",
        email: "super@test.local",
        role: "platform_super_admin",
        status: "active",
      }),
    )
    const { user: invited, invitationNonce } = await service.invite(superSession(), {
      email: "flow@test.local",
      role: "platform_operator",
    })
    await service.setInitialPassword({
      email: "flow@test.local",
      invitationNonce,
      password: "longpassword1",
    })
    const start = await service.startMfaEnrollment({
      platformUserId: invited.platformUserId,
      invitationNonce,
    })
    const secret = start.secretBase32
    const code = authenticator.generate(secret)
    await service.completeMfaEnrollment({
      platformUserId: invited.platformUserId,
      invitationNonce,
      code,
    })
    const activated = await service.activate(superSession(), invited.platformUserId)
    assert.equal(activated.status, "active")
    assert.equal(activated.mfaStatus, "enrolled")
  })

  it("invite succeeds even when transactional email fails", async () => {
    await users.insert(baseUser({ platformUserId: "super-1", email: "super@test.local" }))
    const tx = {
      sendPlatformUserInvited: async () => {
        throw new Error("provider down")
      },
      sendPlatformUserSecurityNotice: async () => {},
      sendPlatformMfaLockoutNotice: async () => {},
      sendPlatformAdminSessionStarted: async () => {},
      sendRegistrationVerificationOtp: async () => {},
      sendRegistrationPaymentConfirmation: async () => {},
    } as unknown as TransactionalEmailService
    const svcWithTx = new PlatformUsersService(
      users,
      new PlatformAuditService(auditRepo),
      mfa,
      tx,
    )
    const out = await svcWithTx.invite(superSession(), {
      email: "mailfail@test.local",
      role: "platform_operator",
    })
    assert.equal(out.user.status, "pending_activation")
    assert.ok(out.invitationNonce.length > 8)
  })

  it("MFA lockout after repeated bad codes", async () => {
    process.env.PLATFORM_MFA_MAX_FAILED = "2"
    process.env.PLATFORM_MFA_LOCKOUT_MINUTES = "15"
    await users.insert(
      baseUser({
        platformUserId: "super-1",
        email: "super@test.local",
        role: "platform_super_admin",
        status: "active",
      }),
    )
    const { user: invited, invitationNonce } = await service.invite(superSession(), {
      email: "lock@test.local",
      role: "platform_operator",
    })
    await service.setInitialPassword({
      email: "lock@test.local",
      invitationNonce,
      password: "longpassword1",
    })
    await service.startMfaEnrollment({
      platformUserId: invited.platformUserId,
      invitationNonce,
    })
    await assert.rejects(
      () =>
        service.completeMfaEnrollment({
          platformUserId: invited.platformUserId,
          invitationNonce,
          code: "000000",
        }),
      (e: unknown) => e instanceof PlatformUserInvariantError,
    )
    await assert.rejects(
      () =>
        service.completeMfaEnrollment({
          platformUserId: invited.platformUserId,
          invitationNonce,
          code: "000001",
        }),
      (e: unknown) => e instanceof PlatformUserConflictError && e.code === "MFA_LOCKED",
    )
    const row = await users.findById(invited.platformUserId)
    assert.ok(row!.mfaLockedUntil && row!.mfaLockedUntil.getTime() > Date.now())
    assert.ok(auditRepo.events.some((e) => e.action === "platform_user.mfa_lockout"))
  })
})
