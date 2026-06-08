import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import {
  type WorkspaceLicenseService,
} from "../../workspace-licenses/services/workspace-license.service.js"
import { assertNotRemovingLastAdmin, assertAtMostOneOtherAdmin } from "../domain/workspace-member-admin.policy.js"
import { assertWorkspaceRoleXor } from "../domain/workspace-member-role.policy.js"
import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../domain/workspace-member-roles.js"
import { assertStatusSeatAlignment, assertStatusTransitionAllowed } from "../domain/workspace-member-status.policy.js"
import type { WorkspaceMemberState } from "../domain/workspace-member.js"
import { WorkspaceUserInvariantError } from "../domain/workspace-user.errors.js"
import type { WorkspaceAssignableMemberDto } from "../dto/workspace-assignable-member.dto.js"
import type { WorkspaceSeatExpansionGate } from "../../billing-seat-enforcement/domain/workspace-seat-expansion-gate.js"
import type {
  ListWorkspaceMembersFilters,
  ListWorkspaceMembersSort,
  WorkspaceMembersListStats,
} from "../persistence/list-workspace-members.types.js"
import type { WorkspaceMemberRepository } from "../persistence/workspace-member.repository.js"
import {
  WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
  type WorkspaceAuditLogWorkspaceMemberAction,
} from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { getPrismaClient } from "../../../infrastructure/postgres/prisma-client.js"
import { runInPrismaTransaction } from "../../../infrastructure/postgres/run-prisma-transaction.js"

export type SeedWorkspaceOwnerInput = {
  membershipPublicId: string
  workspacePublicId: string
  userPublicId: string
  emailNormalized: string
  fullName: string
}

export type UpdateWorkspaceMemberRolesInput = {
  membershipPublicId: string
  workspaceRoleAdministrative: WorkspaceAdministrativeRole | null
  workspaceRoleMethodological: WorkspaceMethodologicalRole | null
  actorUserPublicId: string
}

/**
 * Casos de uso workspace-users. Autorización (workspace-roles): pendiente.
 * Asientos: delegación en `WorkspaceLicenseService.adjustAssignedSeats` (misma transacción cuando aplica).
 */
export class WorkspaceUserService {
  constructor(
    private readonly members: WorkspaceMemberRepository,
    private readonly licenses: WorkspaceLicenseService,
    /** Opcional en tests; en producción debe inyectarse desde `billing-seat-enforcement`. */
    private readonly seatExpansionGate?: WorkspaceSeatExpansionGate,
    private readonly auditLog: WorkspaceAuditLogRepository | null = null,
  ) {}

  /**
   * Idempotente por `membershipPublicId`. Debe alinearse con `WorkspaceOwnerMembership` del owner en registro.
   */
  async seedOwnerFromProvisioning(input: SeedWorkspaceOwnerInput, session?: ClientSession): Promise<WorkspaceMemberState> {
    const existing = await this.members.findByMembershipPublicId(input.membershipPublicId, session)
    if (existing) {
      return existing
    }

    const now = new Date()
    const state: WorkspaceMemberState = {
      membershipPublicId: input.membershipPublicId,
      workspacePublicId: input.workspacePublicId,
      userPublicId: input.userPublicId,
      emailNormalized: normalizeEmailBasic(input.emailNormalized),
      fullName: input.fullName.trim(),
      status: "active",
      hasSeatAssigned: true,
      workspaceRoleAdministrative: "admin",
      workspaceRoleMethodological: null,
      createdAt: now,
      updatedAt: now,
    }

    assertWorkspaceRoleXor(state.workspaceRoleAdministrative, state.workspaceRoleMethodological)
    assertStatusSeatAlignment(state)

    await assertAtMostOneOtherAdmin({
      assigningAdmin: true,
      countOtherActiveAdmins: () =>
        this.members.countOtherActiveAdministrativeAdmins(
          input.workspacePublicId,
          input.membershipPublicId,
          session,
        ),
    })

    await this.members.insert(state, session)
    return state
  }

  async listMembers(workspacePublicId: string): Promise<WorkspaceMemberState[]> {
    return this.members.listByWorkspacePublicId(workspacePublicId)
  }

  async listMembersPaginated(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    options: { sort: ListWorkspaceMembersSort; limit: number; offset: number },
  ): Promise<{ items: WorkspaceMemberState[]; totalCount: number }> {
    return this.members.listByWorkspaceFiltered(workspacePublicId, filters, options)
  }

  async aggregateMemberStats(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters = {},
  ): Promise<WorkspaceMembersListStats> {
    return this.members.aggregateStatusStatsByWorkspace(workspacePublicId, filters)
  }

  /**
   * Miembros que pueden recibir asignación de ítems (activos o con cuenta sin asiento;
   * excluye pendientes y desactivados, alineado a `WorkItemAssignmentService`).
   */
  async listAssignableMembersForWorkItems(workspacePublicId: string): Promise<WorkspaceAssignableMemberDto[]> {
    const rows = await this.listMembers(workspacePublicId)
    return rows
      .filter((m) => m.status === "active" || m.status === "active_without_seat")
      .map((m) => ({
        userPublicId: m.userPublicId,
        fullName: m.fullName,
        emailNormalized: m.emailNormalized,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }))
  }

  /** Actor autenticado en el workspace (resolución HTTP / autorización). */
  async findActorMember(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<WorkspaceMemberState | null> {
    return this.members.findByWorkspaceAndUserPublicId(workspacePublicId, userPublicId)
  }

  /** Lectura para autorización sobre un miembro concreto (p. ej. PATCH roles). */
  async getMemberInWorkspace(
    workspacePublicId: string,
    membershipPublicId: string,
  ): Promise<WorkspaceMemberState | null> {
    const m = await this.members.findByMembershipPublicId(membershipPublicId)
    if (!m || m.workspacePublicId !== workspacePublicId) return null
    return m
  }

  async deactivateMember(
    workspacePublicId: string,
    membershipPublicId: string,
    actorUserPublicId: string,
  ): Promise<WorkspaceMemberState> {
    const { row, auditPrev } = await runInPrismaTransaction(async (session) => {
      const member = await this.requireMemberInWorkspace(workspacePublicId, membershipPublicId, session)
      if (member.status === "deactivated") {
        return { row: member, auditPrev: null }
      }

      await assertNotRemovingLastAdmin({
        isCurrentlyAdmin: member.workspaceRoleAdministrative === "admin",
        countOtherActiveAdmins: () =>
          this.members.countOtherActiveAdministrativeAdmins(
            member.workspacePublicId,
            member.membershipPublicId,
            session,
          ),
      })

      const releasedSeat = member.hasSeatAssigned
      if (releasedSeat) {
        await this.licenses.adjustAssignedSeats(member.workspacePublicId, -1, session)
      }

      const nextRow: WorkspaceMemberState = {
        ...member,
        status: "deactivated",
        hasSeatAssigned: false,
        updatedAt: new Date(),
      }
      assertStatusTransitionAllowed(member.status, nextRow.status)
      assertStatusSeatAlignment(nextRow)
      await this.members.replace(nextRow, session)
      return {
        row: nextRow,
        auditPrev: {
          membershipPublicId: member.membershipPublicId,
          prevStatus: member.status,
          releasedSeat,
        },
      }
    })

    if (auditPrev) {
      await this.tryAppendMemberAudit(workspacePublicId, actorUserPublicId, "member_deactivated", auditPrev, {
        membershipPublicId: auditPrev.membershipPublicId,
        status: "deactivated",
        releasedSeat: auditPrev.releasedSeat,
      })
    }
    return row
  }

  /**
   * Elimina la membresía del workspace (no borra `IdentityRegisteredUser`).
   * Libera asiento activo si aplica, elimina filas de equipos operativos y audita `member_removed`.
   */
  async removeMember(
    workspacePublicId: string,
    membershipPublicId: string,
    actorUserPublicId: string,
  ): Promise<void> {
    const auditPrev = await runInPrismaTransaction(async (session) => {
      const member = await this.requireMemberInWorkspace(workspacePublicId, membershipPublicId, session)

      const isActiveAdmin =
        member.workspaceRoleAdministrative === "admin" && member.status !== "deactivated"
      if (isActiveAdmin) {
        await assertNotRemovingLastAdmin({
          isCurrentlyAdmin: true,
          countOtherActiveAdmins: () =>
            this.members.countOtherActiveAdministrativeAdmins(
              workspacePublicId,
              member.membershipPublicId,
              session,
            ),
        })
      }

      if (member.status === "active" && member.hasSeatAssigned) {
        await this.licenses.adjustAssignedSeats(workspacePublicId, -1, session)
      }

      await getPrismaClient().workTeamMembership.deleteMany({
        where: {
          workspace_public_id: workspacePublicId,
          user_public_id: member.userPublicId,
        },
      })

      const prev = {
        membershipPublicId: member.membershipPublicId,
        userPublicId: member.userPublicId,
        emailNormalized: member.emailNormalized,
        status: member.status,
        hadActiveSeat: member.status === "active" && member.hasSeatAssigned,
        workspaceRoleAdministrative: member.workspaceRoleAdministrative,
        workspaceRoleMethodological: member.workspaceRoleMethodological,
      }

      await this.members.deleteByMembershipPublicId(membershipPublicId, session)
      return prev
    })

    await this.tryAppendMemberAudit(workspacePublicId, actorUserPublicId, "member_removed", auditPrev, {
      membershipPublicId: auditPrev.membershipPublicId,
      removed: true,
    })
  }

  /**
   * Alta operativa: `pending` → `active_without_seat`, o reactivación `deactivated` → `active_without_seat`.
   */
  async activateMember(
    workspacePublicId: string,
    membershipPublicId: string,
    actorUserPublicId: string,
  ): Promise<WorkspaceMemberState> {
    const { row, auditPrev } = await runInPrismaTransaction(async (session) => {
      const member = await this.requireMemberInWorkspace(workspacePublicId, membershipPublicId, session)
      const target: WorkspaceMemberState["status"] = "active_without_seat"
      assertStatusTransitionAllowed(member.status, target)
      const nextRow: WorkspaceMemberState = {
        ...member,
        status: target,
        hasSeatAssigned: false,
        updatedAt: new Date(),
      }
      assertStatusSeatAlignment(nextRow)
      await this.members.replace(nextRow, session)
      const audit =
        member.status !== target
          ? { membershipPublicId: member.membershipPublicId, prevStatus: member.status }
          : null
      return { row: nextRow, auditPrev: audit }
    })

    if (auditPrev) {
      await this.tryAppendMemberAudit(workspacePublicId, actorUserPublicId, "member_activated", auditPrev, {
        membershipPublicId: auditPrev.membershipPublicId,
        status: "active_without_seat",
      })
    }
    return row
  }

  async assignSeat(
    workspacePublicId: string,
    membershipPublicId: string,
    actorUserPublicId: string,
  ): Promise<WorkspaceMemberState> {
    if (this.seatExpansionGate) {
      await this.seatExpansionGate.assertCanExpandSeatConsumption(workspacePublicId)
    }

    const { row, auditPrev } = await runInPrismaTransaction(async (session) => {
      const member = await this.requireMemberInWorkspace(workspacePublicId, membershipPublicId, session)
      if (member.status === "deactivated") {
        throw new WorkspaceUserInvariantError("cannot assign seat to deactivated member")
      }
      if (member.hasSeatAssigned) {
        return { row: member, auditPrev: null }
      }
      if (member.status !== "pending" && member.status !== "active_without_seat") {
        throw new WorkspaceUserInvariantError("member is not eligible for seat assignment in current status")
      }

      await this.licenses.adjustAssignedSeats(member.workspacePublicId, 1, session)

      const nextRow: WorkspaceMemberState = {
        ...member,
        status: "active",
        hasSeatAssigned: true,
        updatedAt: new Date(),
      }
      assertStatusTransitionAllowed(member.status, nextRow.status)
      assertStatusSeatAlignment(nextRow)
      await this.members.replace(nextRow, session)
      return {
        row: nextRow,
        auditPrev: { membershipPublicId: member.membershipPublicId, prevStatus: member.status },
      }
    })

    if (auditPrev) {
      await this.tryAppendMemberAudit(workspacePublicId, actorUserPublicId, "seat_assigned", auditPrev, {
        membershipPublicId: auditPrev.membershipPublicId,
        status: "active",
        hasSeatAssigned: true,
      })
    }
    return row
  }

  async releaseSeat(
    workspacePublicId: string,
    membershipPublicId: string,
    actorUserPublicId: string,
  ): Promise<WorkspaceMemberState> {
    const { row, auditPrev } = await runInPrismaTransaction(async (session) => {
      const member = await this.requireMemberInWorkspace(workspacePublicId, membershipPublicId, session)
      if (!member.hasSeatAssigned) {
        return { row: member, auditPrev: null }
      }
      if (member.status !== "active") {
        throw new WorkspaceUserInvariantError("only active members with a seat can release it explicitly")
      }

      await this.licenses.adjustAssignedSeats(member.workspacePublicId, -1, session)

      const nextRow: WorkspaceMemberState = {
        ...member,
        status: "active_without_seat",
        hasSeatAssigned: false,
        updatedAt: new Date(),
      }
      assertStatusTransitionAllowed(member.status, nextRow.status)
      assertStatusSeatAlignment(nextRow)
      await this.members.replace(nextRow, session)
      return {
        row: nextRow,
        auditPrev: { membershipPublicId: member.membershipPublicId },
      }
    })

    if (auditPrev) {
      await this.tryAppendMemberAudit(workspacePublicId, actorUserPublicId, "seat_released", auditPrev, {
        membershipPublicId: auditPrev.membershipPublicId,
        status: "active_without_seat",
        hasSeatAssigned: false,
      })
    }
    return row
  }

  async updateMemberRoles(
    workspacePublicId: string,
    input: UpdateWorkspaceMemberRolesInput,
  ): Promise<WorkspaceMemberState> {
    assertWorkspaceRoleXor(input.workspaceRoleAdministrative, input.workspaceRoleMethodological)

    const { row, auditPrev } = await runInPrismaTransaction(async (session) => {
      const member = await this.requireMemberInWorkspace(workspacePublicId, input.membershipPublicId, session)
      if (member.status === "deactivated") {
        throw new WorkspaceUserInvariantError("cannot change roles of deactivated member")
      }

      if (
        member.workspaceRoleAdministrative === input.workspaceRoleAdministrative &&
        member.workspaceRoleMethodological === input.workspaceRoleMethodological
      ) {
        return { row: member, auditPrev: null }
      }

      const wasAdmin = member.workspaceRoleAdministrative === "admin"
      const willBeAdmin = input.workspaceRoleAdministrative === "admin"

      if (!wasAdmin && willBeAdmin) {
        await assertAtMostOneOtherAdmin({
          assigningAdmin: true,
          countOtherActiveAdmins: () =>
            this.members.countOtherActiveAdministrativeAdmins(
              member.workspacePublicId,
              member.membershipPublicId,
              session,
            ),
        })
      }

      if (wasAdmin && !willBeAdmin) {
        await assertNotRemovingLastAdmin({
          isCurrentlyAdmin: true,
          countOtherActiveAdmins: () =>
            this.members.countOtherActiveAdministrativeAdmins(
              member.workspacePublicId,
              member.membershipPublicId,
              session,
            ),
        })
      }

      const nextRow: WorkspaceMemberState = {
        ...member,
        workspaceRoleAdministrative: input.workspaceRoleAdministrative,
        workspaceRoleMethodological: input.workspaceRoleMethodological,
        updatedAt: new Date(),
      }

      await this.members.replace(nextRow, session)
      return {
        row: nextRow,
        auditPrev: {
          membershipPublicId: member.membershipPublicId,
          prevAdministrative: member.workspaceRoleAdministrative,
          prevMethodological: member.workspaceRoleMethodological,
        },
      }
    })

    if (auditPrev) {
      await this.tryAppendMemberAudit(workspacePublicId, input.actorUserPublicId, "member_roles_updated", auditPrev, {
        membershipPublicId: auditPrev.membershipPublicId,
        workspaceRoleAdministrative: row.workspaceRoleAdministrative,
        workspaceRoleMethodological: row.workspaceRoleMethodological,
      })
    }
    return row
  }

  private async tryAppendMemberAudit(
    workspacePublicId: string,
    actorUserPublicId: string,
    action: WorkspaceAuditLogWorkspaceMemberAction,
    previousValue: unknown,
    nextValue: unknown,
  ): Promise<void> {
    if (!this.auditLog) return
    try {
      await this.auditLog.append({
        workspacePublicId,
        category: "workspace_member",
        action,
        actorUserPublicId,
        occurredAt: new Date(),
        resource: {
          projectPublicId: WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
          backlogItemPublicId: null,
        },
        previousValue,
        nextValue,
      })
    } catch (err) {
      console.warn("[workspace-users] workspace audit append failed", err)
    }
  }

  private async requireMemberInWorkspace(
    workspacePublicId: string,
    membershipPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceMemberState> {
    const m = await this.members.findByMembershipPublicId(membershipPublicId, session)
    if (!m || m.workspacePublicId !== workspacePublicId) {
      throw new Error("workspace_member_not_found")
    }
    return m
  }
}
