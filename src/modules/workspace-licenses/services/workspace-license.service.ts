import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import {
  WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
  WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
  type WorkspaceAuditLogWorkspaceLicenseAction,
} from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { addOneMonthToFirstOfMonthUtc, isRenewalDue, nextFirstOfMonthUtc } from "../domain/monthly-renewal.policy.js"
import {
  assertCanAssignSeats,
  assertIncreaseValid,
  assertPurchasedCoversAssigned,
  assertScheduleReductionValid,
  SeatCapacityInvariantError,
  SeatReductionScheduleError,
} from "../domain/seat-capacity.policy.js"
import {
  computeSeatsAvailable,
  toSummary,
  type WorkspaceLicenseState,
  type WorkspaceLicenseSummary,
} from "../domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../persistence/workspace-license.repository.js"

export type WorkspaceLicenseAuditActor = { actorUserPublicId: string }

export type SeedWorkspaceLicenseInput = {
  workspacePublicId: string
  /** Default: 1. Debe ser >= `seatsAssigned`. */
  seatsPurchased?: number
  /** Default: 1 (creador cuenta como asiento). */
  seatsAssigned?: number
  /** Referencia para el proximo dia 1 UTC (default: ahora). */
  referenceDate?: Date
}

/**
 * Casos de uso del modulo workspace-licenses.
 * Autorizacion fina (workspace-roles): pendiente; este servicio asume llamadas autorizadas.
 */
export class WorkspaceLicenseService {
  constructor(
    private readonly repo: WorkspaceLicenseRepository,
    private readonly auditLog: WorkspaceAuditLogRepository | null = null,
  ) {}

  async getSummary(workspacePublicId: string): Promise<WorkspaceLicenseSummary | null> {
    const state = await this.repo.findByWorkspacePublicId(workspacePublicId)
    return state ? toSummary(state) : null
  }

  /**
   * Idempotente si ya existe: no duplicar fila (provisioning debe llamar una sola vez por workspace).
   */
  async seedNewWorkspace(input: SeedWorkspaceLicenseInput, session?: ClientSession): Promise<WorkspaceLicenseState> {
    const existing = await this.repo.findByWorkspacePublicId(input.workspacePublicId, session)
    if (existing) {
      return existing
    }

    const ref = input.referenceDate ?? new Date()
    const purchased = input.seatsPurchased ?? 1
    const assigned = input.seatsAssigned ?? 1

    assertPurchasedCoversAssigned(purchased, assigned)
    assertCanAssignSeats(
      {
        workspacePublicId: input.workspacePublicId,
        seatsPurchased: purchased,
        seatsAssigned: 0,
        pendingSeatReduction: null,
        nextRenewalDate: nextFirstOfMonthUtc(ref),
        lastRenewalAt: null,
      },
      assigned,
    )

    const state: WorkspaceLicenseState = {
      workspacePublicId: input.workspacePublicId,
      seatsPurchased: purchased,
      seatsAssigned: assigned,
      pendingSeatReduction: null,
      nextRenewalDate: nextFirstOfMonthUtc(ref),
      lastRenewalAt: null,
    }

    await this.repo.insertInitial(state, session)
    return state
  }

  /**
   * Ingesta desde Paddle webhooks/jobs de confianza: fija `seatsPurchased` absoluto.
   * No exponer en rutas workspace públicas; debe llamarse solo desde integración backend (`billing-seat-enforcement`).
   */
  async applyTrustedAbsoluteSeatsPurchased(
    workspacePublicId: string,
    seatsPurchased: number,
    audit?: WorkspaceLicenseAuditActor,
  ): Promise<WorkspaceLicenseSummary> {
    const state = await this.requireState(workspacePublicId)
    const prevPurchased = state.seatsPurchased
    assertPurchasedCoversAssigned(seatsPurchased, state.seatsAssigned)
    state.seatsPurchased = seatsPurchased
    await this.repo.replace(state)
    const summary = toSummary(state)
    if (audit && prevPurchased !== seatsPurchased) {
      await this.tryAppendLicenseAudit(workspacePublicId, audit.actorUserPublicId, "trusted_absolute_seats_purchased_applied", {
        seatsPurchased: prevPurchased,
      }, {
        seatsPurchased,
      })
    }
    return summary
  }

  /** Aumento inmediato de capacidad contratada (WL-INC). */
  async increaseSeats(
    workspacePublicId: string,
    increment: number,
    audit?: WorkspaceLicenseAuditActor,
  ): Promise<WorkspaceLicenseSummary> {
    assertIncreaseValid(increment)
    const state = await this.requireState(workspacePublicId)
    const prevPurchased = state.seatsPurchased
    state.seatsPurchased += increment
    assertPurchasedCoversAssigned(state.seatsPurchased, state.seatsAssigned)
    await this.repo.replace(state)
    const summary = toSummary(state)
    if (audit) {
      await this.tryAppendLicenseAudit(workspacePublicId, audit.actorUserPublicId, "seats_purchased_increased", {
        seatsPurchased: prevPurchased,
      }, {
        increment,
        seatsPurchased: summary.seatsPurchased,
      })
    }
    return summary
  }

  /**
   * Programa reduccion aplicable en el proximo `nextRenewalDate` (no baja `seatsPurchased` hoy).
   */
  async scheduleSeatReduction(
    workspacePublicId: string,
    targetPurchasedAfterRenewal: number,
    audit?: WorkspaceLicenseAuditActor,
  ): Promise<WorkspaceLicenseSummary> {
    const state = await this.requireState(workspacePublicId)
    assertScheduleReductionValid(state.seatsPurchased, state.seatsAssigned, targetPurchasedAfterRenewal)
    const prevPending = state.pendingSeatReduction

    if (targetPurchasedAfterRenewal === state.seatsPurchased) {
      state.pendingSeatReduction = null
      await this.repo.replace(state)
      const summary = toSummary(state)
      if (audit && prevPending !== null) {
        await this.tryAppendLicenseAudit(workspacePublicId, audit.actorUserPublicId, "scheduled_reduction_cleared", {
          pendingSeatReduction: prevPending,
        }, {
          cleared: true,
        })
      }
      return summary
    }

    state.pendingSeatReduction = {
      targetPurchasedAfterRenewal,
      appliesOn: new Date(state.nextRenewalDate),
    }
    await this.repo.replace(state)
    const summary = toSummary(state)
    if (audit) {
      await this.tryAppendLicenseAudit(workspacePublicId, audit.actorUserPublicId, "seat_reduction_scheduled", {
        seatsPurchased: state.seatsPurchased,
        pendingSeatReduction: prevPending,
      }, {
        targetPurchasedAfterRenewal,
        appliesOn: state.pendingSeatReduction.appliesOn.toISOString(),
      })
    }
    return summary
  }

  async clearScheduledReduction(
    workspacePublicId: string,
    audit?: WorkspaceLicenseAuditActor,
  ): Promise<WorkspaceLicenseSummary> {
    const state = await this.requireState(workspacePublicId)
    const prevPending = state.pendingSeatReduction
    state.pendingSeatReduction = null
    await this.repo.replace(state)
    const summary = toSummary(state)
    if (audit && prevPending !== null) {
      await this.tryAppendLicenseAudit(workspacePublicId, audit.actorUserPublicId, "scheduled_reduction_cleared", {
        pendingSeatReduction: prevPending,
      }, {
        cleared: true,
      })
    }
    return summary
  }

  /**
   * Aplica ciclos de renovacion vencidos respecto a `asOf` (cron / job diario).
   * Avanza `nextRenewalDate` mes a mes; aplica `pendingSeatReduction` en cada ciclo vencido.
   */
  async applyRenewalIfDue(workspacePublicId: string, asOf: Date = new Date()): Promise<WorkspaceLicenseSummary | null> {
    const state = await this.repo.findByWorkspacePublicId(workspacePublicId)
    if (!state) return null

    const snapshots: Array<{ seatsPurchased: number; nextRenewalDate: string }> = []
    let changed = false
    let guard = 0
    while (isRenewalDue(asOf, state.nextRenewalDate) && guard < 36) {
      guard += 1
      const periodStart = state.nextRenewalDate
      snapshots.push({
        seatsPurchased: state.seatsPurchased,
        nextRenewalDate: state.nextRenewalDate.toISOString(),
      })

      let newPurchased = state.seatsPurchased
      if (state.pendingSeatReduction) {
        newPurchased = state.pendingSeatReduction.targetPurchasedAfterRenewal
        state.pendingSeatReduction = null
      }

      assertPurchasedCoversAssigned(newPurchased, state.seatsAssigned)
      state.seatsPurchased = newPurchased
      state.nextRenewalDate = addOneMonthToFirstOfMonthUtc(periodStart)
      state.lastRenewalAt = asOf
      changed = true
    }

    if (changed) {
      await this.repo.replace(state)
      const summary = toSummary(state)
      await this.tryAppendLicenseAudit(
        workspacePublicId,
        WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
        "license_renewal_cycle_applied",
        { cycles: snapshots.slice(0, 12) },
        {
          seatsPurchased: summary.seatsPurchased,
          nextRenewalDate: summary.nextRenewalDate.toISOString(),
          cyclesApplied: snapshots.length,
        },
      )
      return summary
    }
    return toSummary(state)
  }

  /**
   * Extension para workspace-users: delta +1 asignar, -1 liberar.
   */
  async adjustAssignedSeats(
    workspacePublicId: string,
    delta: number,
    session?: ClientSession,
  ): Promise<WorkspaceLicenseSummary> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new SeatCapacityInvariantError("delta must be a non-zero integer")
    }
    const state = await this.requireState(workspacePublicId, session)
    const nextAssigned = state.seatsAssigned + delta
    if (nextAssigned < 0) {
      throw new SeatCapacityInvariantError("seatsAssigned cannot be negative")
    }
    if (delta > 0) {
      assertCanAssignSeats(state, delta)
    }
    state.seatsAssigned = nextAssigned
    assertPurchasedCoversAssigned(state.seatsPurchased, state.seatsAssigned)
    await this.repo.replace(state, session)
    return toSummary(state)
  }

  /** Lectura util para validar asignacion antes de commit en otro modulo. */
  async getSeatsAvailable(workspacePublicId: string): Promise<number | null> {
    const state = await this.repo.findByWorkspacePublicId(workspacePublicId)
    return state ? computeSeatsAvailable(state) : null
  }

  private async requireState(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceLicenseState> {
    const state = await this.repo.findByWorkspacePublicId(workspacePublicId, session)
    if (!state) throw new Error("workspace_license_not_found")
    return state
  }

  private async tryAppendLicenseAudit(
    workspacePublicId: string,
    actorUserPublicId: string,
    action: WorkspaceAuditLogWorkspaceLicenseAction,
    previousValue: unknown,
    nextValue: unknown,
  ): Promise<void> {
    if (!this.auditLog) return
    try {
      await this.auditLog.append({
        workspacePublicId,
        category: "workspace_license",
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
      console.warn("[workspace-licenses] workspace audit append failed", err)
    }
  }
}

export { SeatCapacityInvariantError, SeatReductionScheduleError }
