import { randomBytes, randomUUID } from "node:crypto"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import { platformRoleLabelEs } from "../domain/platform-role-label.es.js"
import type { PlatformRole } from "../domain/platform-role.js"
import type { PlatformSessionContext } from "../domain/platform-session.context.js"
import type { PlatformUserPublic, PlatformUserState } from "../domain/platform-user.entity.js"
import {
  PlatformUserConflictError,
  PlatformUserForbiddenError,
  PlatformUserInvariantError,
} from "../domain/platform-user.errors.js"
import type { PlatformUserRepository } from "../persistence/platform-user.repository.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import { PlatformAuditService } from "./platform-audit.service.js"
import { hashInvitationNonce, nonceEquals } from "./platform-invitation-nonce.js"
import { PlatformMfaTotpService } from "./platform-mfa-totp.service.js"
import { hashPlatformPassword } from "./platform-password.js"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function mfaMaxFailed(): number {
  return Number(process.env.PLATFORM_MFA_MAX_FAILED) || 5
}

function mfaLockoutMinutes(): number {
  return Number(process.env.PLATFORM_MFA_LOCKOUT_MINUTES) || 15
}

function mfaIssuer(): string {
  return process.env.PLATFORM_MFA_ISSUER || "AlineaTec-Admin"
}

export class PlatformUsersService {
  constructor(
    private readonly users: PlatformUserRepository,
    private readonly audit: PlatformAuditService,
    private readonly mfa: PlatformMfaTotpService,
    private readonly transactionalEmail: TransactionalEmailService | null = null,
  ) {}

  private assertSuperAdmin(session: PlatformSessionContext): void {
    if (session.role !== "platform_super_admin") {
      throw new PlatformUserForbiddenError(
        "FORBIDDEN",
        "Solo platform_super_admin puede realizar esta acción.",
      )
    }
  }

  private async assertLastSuperAdminInvariant(
    targetUserId: string,
    nextRole: PlatformRole,
    nextStatus: PlatformUserState["status"],
  ): Promise<void> {
    const target = await this.users.findById(targetUserId)
    if (!target) return
    if (target.role !== "platform_super_admin") return

    const activeSuper = await this.users.countActiveByRole("platform_super_admin")
    const willLeave =
      nextRole !== "platform_super_admin" ||
      nextStatus === "inactive" ||
      nextStatus === "pending_activation"

    if (willLeave && activeSuper === 1 && target.status === "active") {
      throw new PlatformUserConflictError(
        "LAST_SUPER_ADMIN",
        "No se puede desactivar ni degradar al último platform_super_admin activo.",
      )
    }
  }

  toPublic(user: PlatformUserState, viewer: PlatformSessionContext): PlatformUserPublic {
    const {
      mfaTotpSecretBase32: _s,
      invitationNonceHash: _i,
      passwordSalt: _ps,
      passwordHash: _ph,
      ...rest
    } = user
    if (viewer.role === "platform_auditor" && viewer.platformUserId !== user.platformUserId) {
      return {
        ...rest,
        email: redactEmail(user.email),
      }
    }
    return rest
  }

  async list(session: PlatformSessionContext): Promise<PlatformUserPublic[]> {
    const all = await this.users.listAll()
    return all.map((u) => this.toPublic(u, session))
  }

  async getMe(session: PlatformSessionContext): Promise<PlatformUserPublic> {
    const u = await this.users.findById(session.platformUserId)
    if (!u) {
      throw new PlatformUserInvariantError("NOT_FOUND", "Usuario de plataforma no encontrado.")
    }
    return this.toPublic(u, session)
  }

  /**
   * Perfil propio: solo `displayName`. Sin cambio de rol, estado, MFA ni email.
   */
  async patchMe(
    session: PlatformSessionContext,
    input: { displayName: string | null },
  ): Promise<PlatformUserPublic> {
    const u = await this.users.findById(session.platformUserId)
    if (!u) {
      throw new PlatformUserInvariantError("NOT_FOUND", "Usuario de plataforma no encontrado.")
    }
    const before = { displayName: u.displayName }
    const next = input.displayName
    if (before.displayName === next) {
      return this.toPublic(u, session)
    }
    u.displayName = next
    u.updatedAt = new Date()
    await this.users.save(u)
    await this.audit.recordUserEvent(
      session,
      "platform_user.profile_updated",
      u.platformUserId,
      "Nombre visible (perfil propio) actualizado",
      before,
      { displayName: u.displayName },
    )
    return this.toPublic(u, session)
  }

  async invite(
    session: PlatformSessionContext,
    input: { email: string; role: PlatformRole; displayName?: string | null },
  ): Promise<{ user: PlatformUserPublic; invitationNonce: string }> {
    this.assertSuperAdmin(session)

    const email = normalizeEmailBasic(input.email.trim())
    if (!emailRegex.test(email)) {
      throw new PlatformUserInvariantError("VALIDATION", "Email inválido.")
    }

    const existing = await this.users.findByEmail(email)
    if (existing) {
      throw new PlatformUserConflictError(
        "CONFLICT",
        "Ya existe un usuario de plataforma con ese email.",
      )
    }

    const now = new Date()
    const invitationNonce = randomBytes(24).toString("base64url")
    const user: PlatformUserState = {
      platformUserId: randomUUID(),
      email,
      displayName: input.displayName?.trim() || null,
      role: input.role,
      status: "pending_activation",
      mfaStatus: "not_enrolled",
      mfaTotpSecretBase32: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
      invitationNonceHash: hashInvitationNonce(invitationNonce),
      passwordSalt: null,
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.users.insert(user)
    await this.audit.recordUserEvent(
      session,
      "platform_user.invited",
      user.platformUserId,
      `Invitación / alta: ${email} rol ${input.role}`,
      null,
      { email, role: input.role, status: user.status },
    )

    if (this.transactionalEmail) {
      try {
        await this.transactionalEmail.sendPlatformUserInvited({
          toEmail: email,
          displayName: user.displayName,
          roleLabel: platformRoleLabelEs(input.role),
          invitationNonce,
        })
      } catch {
        /* ledger + log en TransactionalEmailService */
      }
    }

    return {
      user: this.toPublic(user, session),
      invitationNonce,
    }
  }

  async setInitialPassword(input: {
    email: string
    invitationNonce: string
    password: string
  }): Promise<PlatformUserState> {
    const u = await this.users.findByEmail(input.email)
    if (!u) {
      throw new PlatformUserInvariantError("user_not_found", "Usuario no encontrado.")
    }
    if (u.passwordHash) {
      throw new PlatformUserConflictError("password_already_set", "La contraseña ya fue definida.")
    }
    if (!nonceEquals(u.invitationNonceHash, input.invitationNonce)) {
      throw new PlatformUserForbiddenError("invalid_nonce", "Nonce de invitación inválido.")
    }
    if (input.password.length < 10) {
      throw new PlatformUserInvariantError("weak_password", "Contraseña demasiado corta (mín. 10).")
    }
    const { salt, hash } = hashPlatformPassword(input.password)
    u.passwordSalt = salt
    u.passwordHash = hash
    u.updatedAt = new Date()
    await this.users.save(u)

    await this.audit.recordUserEvent(
      { platformUserId: u.platformUserId, role: u.role },
      "platform_user.password_set",
      u.platformUserId,
      "Contraseña inicial establecida",
      null,
      { hasPassword: true },
    )

    return u
  }

  async deactivate(session: PlatformSessionContext, platformUserId: string): Promise<PlatformUserPublic> {
    this.assertSuperAdmin(session)
    const u = await this.users.findById(platformUserId)
    if (!u) throw new PlatformUserInvariantError("NOT_FOUND", "Usuario no encontrado.")

    await this.assertLastSuperAdminInvariant(platformUserId, u.role, "inactive")

    const before = { status: u.status, role: u.role }
    u.status = "inactive"
    u.updatedAt = new Date()
    await this.users.save(u)

    await this.audit.recordUserEvent(
      session,
      "platform_user.deactivated",
      platformUserId,
      `Desactivación: ${u.email}`,
      before,
      { status: u.status, role: u.role },
    )

    if (this.transactionalEmail) {
      try {
        await this.transactionalEmail.sendPlatformUserSecurityNotice({
          toEmail: u.email,
          kind: "deactivated",
          greetingName: platformUserGreetingName(u),
        })
      } catch {
        /* ledger + log en TransactionalEmailService */
      }
    }

    return this.toPublic(u, session)
  }

  async activate(session: PlatformSessionContext, platformUserId: string): Promise<PlatformUserPublic> {
    this.assertSuperAdmin(session)
    const u = await this.users.findById(platformUserId)
    if (!u) throw new PlatformUserInvariantError("NOT_FOUND", "Usuario no encontrado.")

    if (u.mfaStatus !== "enrolled") {
      throw new PlatformUserConflictError(
        "MFA_REQUIRED",
        "No se puede activar sin MFA enrolado (TOTP).",
      )
    }

    const before = { status: u.status }
    u.status = "active"
    u.updatedAt = new Date()
    await this.users.save(u)

    await this.audit.recordUserEvent(
      session,
      "platform_user.activated",
      platformUserId,
      `Activación: ${u.email}`,
      before,
      { status: u.status },
    )

    if (this.transactionalEmail) {
      try {
        await this.transactionalEmail.sendPlatformUserSecurityNotice({
          toEmail: u.email,
          kind: "activated",
          greetingName: platformUserGreetingName(u),
        })
      } catch {
        /* ledger + log en TransactionalEmailService */
      }
    }

    return this.toPublic(u, session)
  }

  async changeRole(
    session: PlatformSessionContext,
    platformUserId: string,
    newRole: PlatformRole,
  ): Promise<PlatformUserPublic> {
    this.assertSuperAdmin(session)
    const u = await this.users.findById(platformUserId)
    if (!u) throw new PlatformUserInvariantError("NOT_FOUND", "Usuario no encontrado.")

    await this.assertLastSuperAdminInvariant(platformUserId, newRole, u.status)

    const before = { role: u.role }
    u.role = newRole
    u.updatedAt = new Date()
    await this.users.save(u)

    await this.audit.recordUserEvent(
      session,
      "platform_user.role_changed",
      platformUserId,
      `Cambio de rol: ${before.role} -> ${newRole}`,
      before,
      { role: newRole },
    )

    if (this.transactionalEmail) {
      try {
        await this.transactionalEmail.sendPlatformUserSecurityNotice({
          toEmail: u.email,
          kind: "role_changed",
          greetingName: platformUserGreetingName(u),
          newRoleLabel: platformRoleLabelEs(newRole),
        })
      } catch {
        /* ledger + log en TransactionalEmailService */
      }
    }

    return this.toPublic(u, session)
  }

  async startMfaEnrollment(params: {
    session?: PlatformSessionContext
    platformUserId: string
    invitationNonce?: string
  }): Promise<{ otpauthUrl: string; secretBase32: string }> {
    const u = await this.users.findById(params.platformUserId)
    if (!u) throw new PlatformUserInvariantError("NOT_FOUND", "Usuario no encontrado.")

    if (u.mfaStatus === "enrolled") {
      throw new PlatformUserConflictError("CONFLICT", "MFA ya enrolado.")
    }

    const allowedByNonce =
      params.invitationNonce && nonceEquals(u.invitationNonceHash, params.invitationNonce)
    const allowedBySuper =
      params.session?.role === "platform_super_admin" &&
      params.session.platformUserId !== u.platformUserId

    if (!allowedByNonce && !allowedBySuper) {
      throw new PlatformUserForbiddenError(
        "FORBIDDEN",
        "No autorizado para iniciar enrolamiento MFA (nonce inválido o sin permisos).",
      )
    }

    if (this.isMfaLocked(u)) {
      throw new PlatformUserConflictError("MFA_LOCKED", "Cuenta bloqueada temporalmente por intentos MFA.")
    }

    const secret = this.mfa.generateSecret()
    u.mfaTotpSecretBase32 = secret
    u.updatedAt = new Date()
    await this.users.save(u)

    const actor = params.session ?? { platformUserId: u.platformUserId, role: u.role, email: u.email }

    await this.audit.recordUserEvent(
      actor,
      "platform_user.mfa_enrollment_started",
      u.platformUserId,
      "Inicio enrolamiento TOTP",
      null,
      { mfaStatus: u.mfaStatus },
    )

    return {
      secretBase32: secret,
      otpauthUrl: this.mfa.otpauthUrl(u.email, mfaIssuer(), secret),
    }
  }

  async completeMfaEnrollment(params: {
    platformUserId: string
    invitationNonce?: string
    code: string
    session?: PlatformSessionContext
  }): Promise<PlatformUserPublic> {
    const u = await this.users.findById(params.platformUserId)
    if (!u) throw new PlatformUserInvariantError("NOT_FOUND", "Usuario no encontrado.")

    if (u.mfaStatus === "enrolled") {
      throw new PlatformUserConflictError("CONFLICT", "MFA ya enrolado.")
    }

    const allowedByNonce =
      params.invitationNonce && nonceEquals(u.invitationNonceHash, params.invitationNonce)
    const allowedBySelfOrSuper =
      params.session?.platformUserId === u.platformUserId ||
      params.session?.role === "platform_super_admin"

    if (!allowedByNonce && !allowedBySelfOrSuper) {
      throw new PlatformUserForbiddenError("FORBIDDEN", "No autorizado para completar MFA.")
    }

    if (!u.mfaTotpSecretBase32) {
      throw new PlatformUserInvariantError("VALIDATION", "Debe iniciarse enrolamiento MFA primero.")
    }

    if (this.isMfaLocked(u)) {
      throw new PlatformUserConflictError("MFA_LOCKED", "Cuenta bloqueada temporalmente por intentos MFA.")
    }

    const ok = this.mfa.verify(u.mfaTotpSecretBase32, params.code)
    if (!ok) {
      u.mfaFailedAttempts += 1
      if (u.mfaFailedAttempts >= mfaMaxFailed()) {
        u.mfaLockedUntil = new Date(Date.now() + mfaLockoutMinutes() * 60_000)
        await this.users.save(u)
        const actor = params.session ?? { platformUserId: u.platformUserId, role: u.role, email: u.email }
        await this.audit.recordUserEvent(
          actor,
          "platform_user.mfa_lockout",
          u.platformUserId,
          `Bloqueo MFA hasta ${u.mfaLockedUntil.toISOString()}`,
          { attempts: u.mfaFailedAttempts - 1 },
          { attempts: u.mfaFailedAttempts, lockedUntil: u.mfaLockedUntil.toISOString() },
        )
        if (this.transactionalEmail && u.mfaLockedUntil) {
          try {
            await this.transactionalEmail.sendPlatformMfaLockoutNotice({
              toEmail: u.email,
              lockedUntil: u.mfaLockedUntil,
            })
          } catch {
            /* ledger + log en TransactionalEmailService */
          }
        }
        throw new PlatformUserConflictError("MFA_LOCKED", "Demasiados intentos fallidos de MFA.")
      }
      await this.users.save(u)
      throw new PlatformUserInvariantError("MFA_INVALID", "Código TOTP inválido.")
    }

    u.mfaFailedAttempts = 0
    u.mfaLockedUntil = null
    u.mfaStatus = "enrolled"
    u.invitationNonceHash = null
    u.updatedAt = new Date()
    await this.users.save(u)

    const actor = params.session ?? { platformUserId: u.platformUserId, role: u.role, email: u.email }
    await this.audit.recordUserEvent(
      actor,
      "platform_user.mfa_enrolled",
      u.platformUserId,
      "MFA TOTP enrolado",
      { mfaStatus: "not_enrolled" },
      { mfaStatus: "enrolled" },
    )

    const viewer: PlatformSessionContext =
      params.session ?? {
        platformUserId: u.platformUserId,
        role: u.role,
        email: u.email,
        sessionPublicId: "",
      }
    return this.toPublic(u, viewer)
  }

  private isMfaLocked(u: PlatformUserState): boolean {
    return u.mfaLockedUntil !== null && u.mfaLockedUntil.getTime() > Date.now()
  }

  /**
   * Primer super admin si `PLATFORM_BOOTSTRAP_*` está definido y la colección está vacía.
   */
  async bootstrapFromEnvIfNeeded(): Promise<
    | { status: "created"; email: string }
    | { status: "skipped"; reason: "env_not_configured" | "users_already_exist" }
  > {
    const email = process.env.PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
    const password = process.env.PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD
    if (!email || !password || password.length < 10) {
      return { status: "skipped", reason: "env_not_configured" }
    }
    const count = await this.users.countAll()
    if (count > 0) {
      return { status: "skipped", reason: "users_already_exist" }
    }
    const { salt, hash } = hashPlatformPassword(password)
    const now = new Date()
    const user: PlatformUserState = {
      platformUserId: randomUUID(),
      email: normalizeEmailBasic(email),
      displayName: "Bootstrap super admin",
      role: "platform_super_admin",
      /** Excepción arranque: operativo sin MFA hasta que el operador lo enrolle (flujo normal vía API). */
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
    }
    await this.users.insert(user)
    await this.audit.recordUserEvent(
      { platformUserId: user.platformUserId, role: "platform_super_admin" },
      "platform_user.invited",
      user.platformUserId,
      `Bootstrap env: ${email}`,
      null,
      { email: user.email, role: user.role, bootstrap: true },
    )
    return { status: "created", email: user.email }
  }
}

function platformUserGreetingName(u: PlatformUserState): string {
  const d = u.displayName?.trim()
  return d || u.email
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  const head = local.slice(0, 1)
  return `${head}***@${domain}`
}
