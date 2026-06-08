import assert from "node:assert/strict"
import { test } from "node:test"

import {
  WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID,
  WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
  type WorkspaceAuditLogAppendInput,
} from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkspaceLicenseState } from "../domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../persistence/workspace-license.repository.js"
import { WorkspaceLicenseService } from "./workspace-license.service.js"

const WS = "11111111-2222-4333-8444-555555555555"

function cloneState(s: WorkspaceLicenseState): WorkspaceLicenseState {
  return {
    ...s,
    nextRenewalDate: new Date(s.nextRenewalDate),
    lastRenewalAt: s.lastRenewalAt ? new Date(s.lastRenewalAt) : null,
    pendingSeatReduction: s.pendingSeatReduction
      ? {
          targetPurchasedAfterRenewal: s.pendingSeatReduction.targetPurchasedAfterRenewal,
          appliesOn: new Date(s.pendingSeatReduction.appliesOn),
        }
      : null,
  }
}

class MemLicenseRepo implements WorkspaceLicenseRepository {
  private row: WorkspaceLicenseState | null

  constructor(initial: WorkspaceLicenseState) {
    this.row = cloneState(initial)
  }

  async findByWorkspacePublicId(workspacePublicId: string) {
    if (!this.row || this.row.workspacePublicId !== workspacePublicId) return null
    return cloneState(this.row)
  }

  async findManyByWorkspacePublicIds(workspacePublicIds: string[]) {
    const m = new Map<string, WorkspaceLicenseState>()
    for (const id of workspacePublicIds) {
      const r = await this.findByWorkspacePublicId(id)
      if (r) m.set(id, r)
    }
    return m
  }

  async insertInitial(state: WorkspaceLicenseState) {
    this.row = cloneState(state)
  }

  async replace(state: WorkspaceLicenseState) {
    this.row = cloneState(state)
  }
}

class CaptureAudit implements WorkspaceAuditLogRepository {
  entries: WorkspaceAuditLogAppendInput[] = []

  async append(input: WorkspaceAuditLogAppendInput): Promise<void> {
    this.entries.push(input)
  }

  async listForProject(): Promise<never[]> {
    return []
  }
}

function baseState(over?: Partial<WorkspaceLicenseState>): WorkspaceLicenseState {
  return {
    workspacePublicId: WS,
    seatsPurchased: 5,
    seatsAssigned: 2,
    pendingSeatReduction: null,
    nextRenewalDate: new Date("2026-02-01T00:00:00.000Z"),
    lastRenewalAt: null,
    ...over,
  }
}

test("increaseSeats con audit registra categoría workspace_license y acción seats_purchased_increased", async () => {
  const audit = new CaptureAudit()
  const svc = new WorkspaceLicenseService(new MemLicenseRepo(baseState()), audit)
  await svc.increaseSeats(WS, 2, { actorUserPublicId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee" })
  assert.equal(audit.entries.length, 1)
  const e = audit.entries[0]
  assert.equal(e.category, "workspace_license")
  assert.equal(e.action, "seats_purchased_increased")
  assert.equal(e.actorUserPublicId, "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee")
  assert.equal(e.resource.projectPublicId, WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID)
  assert.equal(e.resource.backlogItemPublicId, null)
  assert.deepEqual(e.previousValue, { seatsPurchased: 5 })
  assert.deepEqual(e.nextValue, { increment: 2, seatsPurchased: 7 })
})

test("applyTrustedAbsoluteSeatsPurchased no registra audit si seatsPurchased no cambia", async () => {
  const audit = new CaptureAudit()
  const svc = new WorkspaceLicenseService(new MemLicenseRepo(baseState({ seatsPurchased: 4 })), audit)
  await svc.applyTrustedAbsoluteSeatsPurchased(WS, 4, {
    actorUserPublicId: WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
  })
  assert.equal(audit.entries.length, 0)
})

test("applyTrustedAbsoluteSeatsPurchased registra trusted_absolute_seats_purchased_applied cuando cambia la capacidad", async () => {
  const audit = new CaptureAudit()
  const svc = new WorkspaceLicenseService(new MemLicenseRepo(baseState({ seatsPurchased: 3 })), audit)
  await svc.applyTrustedAbsoluteSeatsPurchased(WS, 8, {
    actorUserPublicId: WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID,
  })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].action, "trusted_absolute_seats_purchased_applied")
  assert.deepEqual(audit.entries[0].previousValue, { seatsPurchased: 3 })
  assert.deepEqual(audit.entries[0].nextValue, { seatsPurchased: 8 })
})

test("scheduleSeatReduction con audit registra seat_reduction_scheduled", async () => {
  const audit = new CaptureAudit()
  const svc = new WorkspaceLicenseService(new MemLicenseRepo(baseState()), audit)
  await svc.scheduleSeatReduction(WS, 3, { actorUserPublicId: "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee" })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].action, "seat_reduction_scheduled")
  assert.equal(audit.entries[0].actorUserPublicId, "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee")
})

test("clearScheduledReduction con audit y pending previo registra scheduled_reduction_cleared", async () => {
  const pending = {
    targetPurchasedAfterRenewal: 2,
    appliesOn: new Date("2026-02-01T00:00:00.000Z"),
  }
  const audit = new CaptureAudit()
  const svc = new WorkspaceLicenseService(new MemLicenseRepo(baseState({ pendingSeatReduction: pending })), audit)
  await svc.clearScheduledReduction(WS, { actorUserPublicId: "cccccccc-bbbb-4ccc-dddd-eeeeeeeeeeee" })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].action, "scheduled_reduction_cleared")
})

test("applyRenewalIfDue vencido registra license_renewal_cycle_applied con actor de integración", async () => {
  const audit = new CaptureAudit()
  const svc = new WorkspaceLicenseService(
    new MemLicenseRepo(
      baseState({
        nextRenewalDate: new Date("2026-01-01T00:00:00.000Z"),
        pendingSeatReduction: {
          targetPurchasedAfterRenewal: 4,
          appliesOn: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    ),
    audit,
  )
  const asOf = new Date("2026-01-15T12:00:00.000Z")
  await svc.applyRenewalIfDue(WS, asOf)
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].action, "license_renewal_cycle_applied")
  assert.equal(audit.entries[0].actorUserPublicId, WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID)
})

test("sin auditLog increaseSeats con auditActor no lanza", async () => {
  const svc = new WorkspaceLicenseService(new MemLicenseRepo(baseState()), null)
  await svc.increaseSeats(WS, 1, { actorUserPublicId: "dddddddd-bbbb-4ccc-dddd-eeeeeeeeeeee" })
})
