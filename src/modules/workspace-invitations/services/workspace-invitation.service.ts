import { randomBytes, randomUUID } from "node:crypto"
import { getWorkspaceAppPublicOrigin } from "../../../config/workspace-app-public-url.js"
import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type { WorkspaceSeatExpansionGate } from "../../billing-seat-enforcement/domain/workspace-seat-expansion-gate.js"
import type { IdentityRegisteredUserForAuthRepository } from "../../login-session/persistence/identity-registered-user-for-auth.repository.js"
import { hashIdentityRegistrationIntentPassword } from "../../registro-onboarding/services/intent-password-hash.js"
import { getPrismaClient } from "../../../infrastructure/postgres/prisma-client.js"
import { runInPrismaTransaction } from "../../../infrastructure/postgres/run-prisma-transaction.js"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import {
  SeatCapacityInvariantError,
  type WorkspaceLicenseService,
} from "../../workspace-licenses/services/workspace-license.service.js"
import { assertAtMostOneOtherAdmin } from "../../workspace-users/domain/workspace-member-admin.policy.js"
import { assertWorkspaceRoleXor } from "../../workspace-users/domain/workspace-member-role.policy.js"
import { assertStatusSeatAlignment } from "../../workspace-users/domain/workspace-member-status.policy.js"
import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../../workspace-users/domain/workspace-member-roles.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceIdentityRepository } from "../../workspace-users/persistence/workspace-identity.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import { WorkspaceUserConflictError } from "../../workspace-users/domain/workspace-user.errors.js"
import { WorkspaceInvitationError } from "../domain/workspace-invitation.errors.js"
import type { WorkspaceInvitationState } from "../domain/workspace-invitation.js"
import type {
  WorkspaceInvitationPlatformAdminListFilter,
  WorkspaceInvitationRepository,
} from "../persistence/workspace-invitation.repository.js"
import { hashWorkspaceInvitationOpaqueToken } from "./invitation-token-hash.js"

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type CreateWorkspaceInvitationAdminInput = {
  workspacePublicId: string
  emailNormalized: string
  fullName: string
  workspaceRoleAdministrative: WorkspaceAdministrativeRole | null
  workspaceRoleMethodological: WorkspaceMethodologicalRole | null
  assignSeat?: boolean
  actorUserPublicId: string
}

export type PublicInvitationResolveResult =
  | {
      kind: "ok"
      invitationPublicId: string
      workspacePublicId: string
      workspaceDisplayName: string
      workspaceCode: string
      emailNormalized: string
      fullNameProposed: string
      roleLabel: string
      expiresAt: string
      hasRegisteredAccount: boolean
      alreadyMember: boolean
    }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "superseded" }
  | { kind: "accepted" }
  | { kind: "not_found" }

function roleLabelEs(
  administrative: WorkspaceAdministrativeRole | null,
  methodological: WorkspaceMethodologicalRole | null,
): string {
  if (administrative) {
    const labels: Record<WorkspaceAdministrativeRole, string> = {
      admin: "Administrador",
      operator: "Operador",
      auditor: "Auditor",
    }
    return labels[administrative]
  }
  const labels: Record<WorkspaceMethodologicalRole, string> = {
    scrum_master: "Scrum Master",
    product_owner: "Product Owner",
    scrum_developer: "Developer",
    agility_lead: "Agility Lead",
    scrum_coach: "Scrum Coach",
  }
  return methodological ? labels[methodological] : "—"
}

function buildAcceptUrl(rawToken: string): string | null {
  const origin = getWorkspaceAppPublicOrigin()
  if (!origin) return null
  const u = new URL("/app/workspace/invitations/accept", origin)
  u.searchParams.set("token", rawToken)
  return u.toString()
}

export type WorkspaceInvitationPlatformAdminRow = {
  invitationPublicId: string
  workspacePublicId: string
  emailNormalized: string
  fullNameProposed: string
  status: WorkspaceInvitationState["status"]
  expiresAt: string
  assignSeatProposal: boolean
  workspaceRoleAdministrative: WorkspaceInvitationState["workspaceRoleAdministrative"]
  workspaceRoleMethodological: WorkspaceInvitationState["workspaceRoleMethodological"]
  invitedByUserPublicId: string
  createdAt: string
  updatedAt: string
  acceptedAt: string | null
  revokedAt: string | null
  supersededByInvitationPublicId: string | null
  emailCommsSentAt: string | null
  roleLabel: string
}

function mapInvitationStateToPlatformAdminRow(r: WorkspaceInvitationState): WorkspaceInvitationPlatformAdminRow {
  return {
    invitationPublicId: r.invitationPublicId,
    workspacePublicId: r.workspacePublicId,
    emailNormalized: r.emailNormalized,
    fullNameProposed: r.fullNameProposed,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    assignSeatProposal: r.assignSeatProposal,
    workspaceRoleAdministrative: r.workspaceRoleAdministrative,
    workspaceRoleMethodological: r.workspaceRoleMethodological,
    invitedByUserPublicId: r.invitedByUserPublicId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    supersededByInvitationPublicId: r.supersededByInvitationPublicId,
    emailCommsSentAt: r.emailCommsSentAt ? r.emailCommsSentAt.toISOString() : null,
    roleLabel: roleLabelEs(r.workspaceRoleAdministrative, r.workspaceRoleMethodological),
  }
}

export class WorkspaceInvitationService {
  constructor(
    private readonly invitations: WorkspaceInvitationRepository,
    private readonly members: WorkspaceMemberRepository,
    private readonly workspaces: WorkspaceIdentityRepository,
    private readonly licenses: WorkspaceLicenseService,
    private readonly billingState: WorkspaceBillingStateService,
    private readonly registeredUsers: IdentityRegisteredUserForAuthRepository,
    private readonly transactionalEmail: TransactionalEmailService | null,
    private readonly seatExpansionGate?: WorkspaceSeatExpansionGate,
  ) {}

  async createInvitationFromAdmin(input: CreateWorkspaceInvitationAdminInput): Promise<{
    rawToken: string
    invitation: WorkspaceInvitationState
  }> {
    const emailNormalized = normalizeEmailBasic(input.emailNormalized)
    const fullName = input.fullName.trim()
    assertWorkspaceRoleXor(input.workspaceRoleAdministrative, input.workspaceRoleMethodological)

    if (input.assignSeat === true && this.seatExpansionGate) {
      await this.seatExpansionGate.assertCanExpandSeatConsumption(input.workspacePublicId)
    }

    if (input.assignSeat === true) {
      const billing = await this.billingState.getBillingState(input.workspacePublicId)
      if (!billing.guards.canInviteSeatConsumingMembers) {
        throw new WorkspaceInvitationError(
          "workspace_invitation_blocked_by_billing",
          "No se pueden invitar miembros con asiento mientras el workspace está restringido por facturación.",
        )
      }
    }

    const dupMember = await this.members.findByWorkspaceAndEmail(
      input.workspacePublicId,
      emailNormalized,
    )
    if (dupMember) {
      throw new WorkspaceUserConflictError("ya existe un miembro con este correo en el workspace")
    }

    const rawToken = randomBytes(32).toString("base64url")
    const tokenHash = hashWorkspaceInvitationOpaqueToken(rawToken)
    const invitationPublicId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)

    const row: WorkspaceInvitationState = {
      invitationPublicId,
      workspacePublicId: input.workspacePublicId,
      emailNormalized,
      fullNameProposed: fullName,
      workspaceRoleAdministrative: input.workspaceRoleAdministrative,
      workspaceRoleMethodological: input.workspaceRoleMethodological,
      assignSeatProposal: input.assignSeat === true,
      tokenHash,
      status: "pending",
      expiresAt,
      invitedByUserPublicId: input.actorUserPublicId,
      acceptedAt: null,
      revokedAt: null,
      supersededByInvitationPublicId: null,
      emailCommsSentAt: null,
      createdAt: now,
      updatedAt: now,
    }

    await runInPrismaTransaction(async (session) => {
      const pendingPrev = await this.invitations.findPendingByWorkspaceAndEmail(
        input.workspacePublicId,
        emailNormalized,
        session,
      )
      if (pendingPrev) {
        pendingPrev.status = "superseded"
        pendingPrev.supersededByInvitationPublicId = invitationPublicId
        pendingPrev.updatedAt = new Date()
        await this.invitations.replace(pendingPrev, session)
      }
      await assertAtMostOneOtherAdmin({
        assigningAdmin: input.workspaceRoleAdministrative === "admin",
        countOtherActiveAdmins: () =>
          this.members.countOtherActiveAdministrativeAdmins(input.workspacePublicId, null, session),
      })
      await this.invitations.insert(row, session)
    })

    const ws = await this.workspaces.findByWorkspacePublicId(input.workspacePublicId)
    if (this.transactionalEmail && ws) {
      const url = buildAcceptUrl(rawToken)
      if (url) {
        await this.transactionalEmail.sendWorkspaceInvitationSent({
          toEmail: emailNormalized,
          displayName: fullName,
          workspaceDisplayName: ws.displayName,
          workspaceCode: ws.code,
          roleLabel: roleLabelEs(input.workspaceRoleAdministrative, input.workspaceRoleMethodological),
          acceptUrl: url,
        })
        const sent = await this.invitations.findByInvitationPublicId(invitationPublicId)
        if (sent && sent.status === "pending") {
          sent.emailCommsSentAt = new Date()
          sent.updatedAt = new Date()
          await this.invitations.replace(sent)
        }
      }
    }

    return { rawToken, invitation: row }
  }

  async resolvePublicToken(rawToken: string): Promise<PublicInvitationResolveResult> {
    const tokenHash = hashWorkspaceInvitationOpaqueToken(rawToken.trim())
    const inv = await this.invitations.findByTokenHash(tokenHash)
    if (!inv) return { kind: "not_found" }
    const now = new Date()

    if (inv.status === "accepted") return { kind: "accepted" }
    if (inv.status === "revoked") return { kind: "revoked" }
    if (inv.status === "superseded") return { kind: "superseded" }
    if (inv.expiresAt.getTime() <= now.getTime()) return { kind: "expired" }

    const ws = await this.workspaces.findByWorkspacePublicId(inv.workspacePublicId)
    if (!ws) return { kind: "not_found" }

    const dupMember = await this.members.findByWorkspaceAndEmail(inv.workspacePublicId, inv.emailNormalized)
    const reg = await this.registeredUsers.findByEmailNormalized(inv.emailNormalized)

    return {
      kind: "ok",
      invitationPublicId: inv.invitationPublicId,
      workspacePublicId: inv.workspacePublicId,
      workspaceDisplayName: ws.displayName,
      workspaceCode: ws.code,
      emailNormalized: inv.emailNormalized,
      fullNameProposed: inv.fullNameProposed,
      roleLabel: roleLabelEs(inv.workspaceRoleAdministrative, inv.workspaceRoleMethodological),
      expiresAt: inv.expiresAt.toISOString(),
      hasRegisteredAccount: reg !== null,
      alreadyMember: dupMember !== null && dupMember.status !== "deactivated",
    }
  }

  async acceptWithIdentityRegisteredUser(params: {
    rawToken: string
    sessionUserPublicId: string
    sessionEmailNormalized: string
    confirm: boolean
  }): Promise<WorkspaceMemberState> {
    if (!params.confirm) {
      throw new WorkspaceInvitationError("invitation_confirm_required", "Se requiere confirmación explícita.")
    }

    const tokenHash = hashWorkspaceInvitationOpaqueToken(params.rawToken.trim())
    const inv = await this.invitations.findByTokenHash(tokenHash)
    if (!inv) {
      throw new WorkspaceInvitationError("invitation_not_found", "Invitación no encontrada.")
    }

    const now = new Date()
    if (inv.status !== "pending" || inv.expiresAt.getTime() <= now.getTime()) {
      if (inv.expiresAt.getTime() <= now.getTime()) {
        throw new WorkspaceInvitationError("invitation_expired", "La invitación caducó.")
      }
      if (inv.status === "revoked") {
        throw new WorkspaceInvitationError("invitation_revoked", "La invitación fue revocada.")
      }
      if (inv.status === "superseded") {
        throw new WorkspaceInvitationError("invitation_superseded", "La invitación fue reemplazada por otra.")
      }
      throw new WorkspaceInvitationError("invitation_not_pending", "La invitación ya no está pendiente.")
    }

    const normInviteEmail = normalizeEmailBasic(inv.emailNormalized)
    const normSessionEmail = normalizeEmailBasic(params.sessionEmailNormalized)
    if (normInviteEmail !== normSessionEmail) {
      throw new WorkspaceInvitationError(
        "invitation_requires_different_account",
        "Esta invitación es para otro correo. Cierra sesión e inicia con la cuenta invitada.",
      )
    }

    const reg = await this.registeredUsers.findByEmailNormalized(normInviteEmail)
    if (!reg || reg.userPublicId !== params.sessionUserPublicId) {
      throw new WorkspaceInvitationError(
        "invitation_requires_different_account",
        "La sesión no coincide con la cuenta invitada.",
      )
    }

    const billing = await this.billingState.getBillingState(inv.workspacePublicId)
    if (!billing.guards.canUsePrimaryWorkspaceProductFeatures) {
      throw new WorkspaceInvitationError(
        "workspace_not_accessible",
        "El workspace no admite nuevas altas en este momento (p. ej. facturación suspendida).",
      )
    }

    return this.materializeMembershipFromInvitation(inv, reg.userPublicId, inv.fullNameProposed)
  }

  async registerAndAccept(params: {
    rawToken: string
    fullName: string
    password: string
  }): Promise<WorkspaceMemberState> {
    if (params.password.length < 8 || params.password.length > 128) {
      throw new WorkspaceInvitationError("invalid_password", "La contraseña debe tener entre 8 y 128 caracteres.")
    }

    const tokenHash = hashWorkspaceInvitationOpaqueToken(params.rawToken.trim())
    const inv = await this.invitations.findByTokenHash(tokenHash)
    if (!inv) {
      throw new WorkspaceInvitationError("invitation_not_found", "Invitación no encontrada.")
    }
    const now = new Date()
    if (inv.status !== "pending" || inv.expiresAt.getTime() <= now.getTime()) {
      throw new WorkspaceInvitationError("invitation_expired", "La invitación caducó o no es válida.")
    }

    const emailNormalized = normalizeEmailBasic(inv.emailNormalized)
    const existing = await this.registeredUsers.findByEmailNormalized(emailNormalized)
    if (existing) {
      throw new WorkspaceInvitationError(
        "invitation_account_already_exists",
        "Ya existe una cuenta con este correo. Inicia sesión y acepta la invitación.",
      )
    }

    const ws = await this.workspaces.findByWorkspacePublicId(inv.workspacePublicId)
    if (!ws) {
      throw new WorkspaceInvitationError("workspace_not_found", "Workspace no encontrado.")
    }

    const userPublicId = randomUUID()
    const passwordHash = hashIdentityRegistrationIntentPassword(params.password)
    const fullName = params.fullName.trim() || inv.fullNameProposed.trim()

    await getPrismaClient().identityUser.create({
      data: {
        public_id: userPublicId,
        email_normalized: emailNormalized,
        full_name: fullName,
        password_hash: passwordHash,
        modality_at_signup: ws.modality === "empresa" ? "team" : ws.modality,
        source_registration_intent_public_id: inv.invitationPublicId,
        preferred_active_workspace_public_id: inv.workspacePublicId,
        preferred_active_workspace_updated_at: new Date(),
      },
    })

    const billing = await this.billingState.getBillingState(inv.workspacePublicId)
    if (!billing.guards.canUsePrimaryWorkspaceProductFeatures) {
      throw new WorkspaceInvitationError(
        "workspace_not_accessible",
        "El workspace no admite nuevas altas en este momento.",
      )
    }
    if (inv.assignSeatProposal && !billing.guards.canInviteSeatConsumingMembers) {
      await getPrismaClient().identityUser.delete({ where: { public_id: userPublicId } }).catch(() => {})
      throw new WorkspaceInvitationError(
        "workspace_invitation_blocked_by_billing",
        "El workspace no admite altas con asiento en este momento.",
      )
    }

    try {
      return await this.materializeMembershipFromInvitation(inv, userPublicId, fullName)
    } catch (err) {
      await getPrismaClient().identityUser.delete({ where: { public_id: userPublicId } }).catch(() => {})
      throw err
    }
  }

  private async materializeMembershipFromInvitation(
    inv: WorkspaceInvitationState,
    userPublicId: string,
    fullName: string,
  ): Promise<WorkspaceMemberState> {
    const emailNormalized = normalizeEmailBasic(inv.emailNormalized)

    const member = await runInPrismaTransaction(async (session) => {
      const dupEmail = await this.members.findByWorkspaceAndEmail(inv.workspacePublicId, emailNormalized, session)
      if (dupEmail && dupEmail.userPublicId === userPublicId && dupEmail.status !== "deactivated") {
        const pendingInv = await this.invitations.findByTokenHash(inv.tokenHash, session)
        if (pendingInv && pendingInv.status === "pending") {
          pendingInv.status = "accepted"
          pendingInv.acceptedAt = new Date()
          pendingInv.updatedAt = new Date()
          await this.invitations.replace(pendingInv, session)
        }
        return dupEmail
      }
      if (dupEmail) {
        throw new WorkspaceUserConflictError("email already exists in this workspace")
      }

      await assertAtMostOneOtherAdmin({
        assigningAdmin: inv.workspaceRoleAdministrative === "admin",
        countOtherActiveAdmins: () =>
          this.members.countOtherActiveAdministrativeAdmins(inv.workspacePublicId, null, session),
      })

      if (inv.assignSeatProposal && this.seatExpansionGate) {
        await this.seatExpansionGate.assertCanExpandSeatConsumption(inv.workspacePublicId)
      }

      let status: WorkspaceMemberState["status"] = "active_without_seat"
      let hasSeatAssigned = false
      if (inv.assignSeatProposal) {
        try {
          await this.licenses.adjustAssignedSeats(inv.workspacePublicId, 1, session)
          hasSeatAssigned = true
          status = "active"
        } catch (err) {
          if (err instanceof SeatCapacityInvariantError) {
            hasSeatAssigned = false
            status = "active_without_seat"
          } else {
            throw err
          }
        }
      }

      const now = new Date()
      const row: WorkspaceMemberState = {
        membershipPublicId: randomUUID(),
        workspacePublicId: inv.workspacePublicId,
        userPublicId,
        emailNormalized,
        fullName: fullName.trim(),
        status,
        hasSeatAssigned,
        workspaceRoleAdministrative: inv.workspaceRoleAdministrative,
        workspaceRoleMethodological: inv.workspaceRoleMethodological,
        createdAt: now,
        updatedAt: now,
      }
      assertStatusSeatAlignment(row)
      await this.members.insert(row, session)

      const invFresh = await this.invitations.findByInvitationPublicId(inv.invitationPublicId, session)
      if (invFresh && invFresh.status === "pending") {
        invFresh.status = "accepted"
        invFresh.acceptedAt = new Date()
        invFresh.updatedAt = new Date()
        await this.invitations.replace(invFresh, session)
      }

      return row
    })

    const ws = await this.workspaces.findByWorkspacePublicId(inv.workspacePublicId)
    if (this.transactionalEmail && ws) {
      await this.transactionalEmail.sendWorkspaceInvitationAcceptedNotice({
        toEmail: emailNormalized,
        displayName: member.fullName,
        workspaceDisplayName: ws.displayName,
        workspaceCode: ws.code,
      })
    }

    await this.registeredUsers.setPreferredActiveWorkspacePublicId(userPublicId, inv.workspacePublicId)

    return member
  }

  async revokeInvitation(
    workspacePublicId: string,
    invitationPublicId: string,
    actorUserPublicId: string,
  ): Promise<void> {
    const inv = await this.invitations.findByInvitationPublicId(invitationPublicId)
    if (!inv || inv.workspacePublicId !== workspacePublicId) {
      throw new WorkspaceInvitationError("invitation_not_found", "Invitación no encontrada.")
    }
    if (inv.status !== "pending") {
      throw new WorkspaceInvitationError("invitation_not_pending", "La invitación ya no está pendiente.")
    }
    inv.status = "revoked"
    inv.revokedAt = new Date()
    inv.updatedAt = new Date()
    await this.invitations.replace(inv)

    const ws = await this.workspaces.findByWorkspacePublicId(workspacePublicId)
    if (this.transactionalEmail && ws && inv.emailCommsSentAt) {
      await this.transactionalEmail.sendWorkspaceInvitationRevokedNotice({
        toEmail: inv.emailNormalized,
        displayName: inv.fullNameProposed,
        workspaceDisplayName: ws.displayName,
      })
    }
    void actorUserPublicId
  }

  async resendInvitation(
    workspacePublicId: string,
    invitationPublicId: string,
    _actorUserPublicId: string,
  ): Promise<{ rawToken: string }> {
    const inv = await this.invitations.findByInvitationPublicId(invitationPublicId)
    if (!inv || inv.workspacePublicId !== workspacePublicId) {
      throw new WorkspaceInvitationError("invitation_not_found", "Invitación no encontrada.")
    }
    if (inv.status !== "pending") {
      throw new WorkspaceInvitationError("invitation_not_pending", "Solo se reenvían invitaciones pendientes.")
    }

    const rawToken = randomBytes(32).toString("base64url")
    inv.tokenHash = hashWorkspaceInvitationOpaqueToken(rawToken)
    inv.expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    inv.updatedAt = new Date()
    await this.invitations.replace(inv)

    const ws = await this.workspaces.findByWorkspacePublicId(workspacePublicId)
    if (this.transactionalEmail && ws) {
      const url = buildAcceptUrl(rawToken)
      if (url) {
        await this.transactionalEmail.sendWorkspaceInvitationSent({
          toEmail: inv.emailNormalized,
          displayName: inv.fullNameProposed,
          workspaceDisplayName: ws.displayName,
          workspaceCode: ws.code,
          roleLabel: roleLabelEs(inv.workspaceRoleAdministrative, inv.workspaceRoleMethodological),
          acceptUrl: url,
        })
        inv.emailCommsSentAt = new Date()
        inv.updatedAt = new Date()
        await this.invitations.replace(inv)
      }
    }

    return { rawToken }
  }

  async listPendingInvitationsSafe(workspacePublicId: string): Promise<
    Array<{
      invitationPublicId: string
      workspacePublicId: string
      emailNormalized: string
      fullNameProposed: string
      status: WorkspaceInvitationState["status"]
      expiresAt: string
      assignSeatProposal: boolean
      workspaceRoleAdministrative: WorkspaceInvitationState["workspaceRoleAdministrative"]
      workspaceRoleMethodological: WorkspaceInvitationState["workspaceRoleMethodological"]
      invitedByUserPublicId: string
      createdAt: string
    }>
  > {
    const rows = await this.invitations.listPendingForWorkspace(workspacePublicId)
    return rows.map((r) => ({
      invitationPublicId: r.invitationPublicId,
      workspacePublicId: r.workspacePublicId,
      emailNormalized: r.emailNormalized,
      fullNameProposed: r.fullNameProposed,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      assignSeatProposal: r.assignSeatProposal,
      workspaceRoleAdministrative: r.workspaceRoleAdministrative,
      workspaceRoleMethodological: r.workspaceRoleMethodological,
      invitedByUserPublicId: r.invitedByUserPublicId,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  async listInvitationsForPlatformAdmin(
    filter: WorkspaceInvitationPlatformAdminListFilter,
  ): Promise<{ items: WorkspaceInvitationPlatformAdminRow[]; total: number }> {
    const { rows, total } = await this.invitations.listForPlatformAdminQuery(filter)
    return { items: rows.map(mapInvitationStateToPlatformAdminRow), total }
  }
}
