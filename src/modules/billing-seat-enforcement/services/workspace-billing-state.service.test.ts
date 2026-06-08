import assert from "node:assert/strict"
import { test } from "node:test"

import { computeGraceEndsAtInclusivePattern } from "../domain/billing-period.policy.js"
import type { BillingAuditEventType, WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingAuditRepository } from "../persistence/workspace-billing-audit.repository.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import type { WorkspaceLicenseSummary } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { BillingNotificationPort, BillingRecoveryContext } from "../domain/billing-notification-port.js"

const WS = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"

class MemSnap implements WorkspaceBillingSnapshotRepository {
  row: WorkspaceBillingSnapshotProps | null = null

  async findByWorkspacePublicId(workspacePublicId: string) {
    return workspacePublicId === WS ? this.row : null
  }

  async findBySubscriptionExternalId(_subscriptionExternalId: string) {
    return null
  }

  async findPaddleLinkedWorkspacePublicIds(_limit: number): Promise<string[]> {
    return []
  }

  async insertInitial(row: WorkspaceBillingSnapshotProps) {
    this.row = row
  }

  async replace(row: WorkspaceBillingSnapshotProps) {
    this.row = row
  }

  async findGraceSnapshotsEndingWithin(_now: Date, _lookaheadMs: number): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }

  async findSnapshotsWithGraceExpiredBefore(_now: Date): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }

  async countForPlatformFilter(): Promise<number> {
    return 0
  }

  async findForPlatformFilter(
    _filter: unknown,
    _opts: { skip: number; limit: number },
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }
}

class MemSnapForSweep extends MemSnap {
  async findSnapshotsWithGraceExpiredBefore(now: Date): Promise<WorkspaceBillingSnapshotProps[]> {
    if (!this.row) return []
    if (
      (this.row.billingStatus === "grace_period" || this.row.billingStatus === "payment_action_required") &&
      this.row.gracePeriodEndsAt &&
      this.row.gracePeriodEndsAt <= now
    ) {
      return [this.row]
    }
    return []
  }
}

class RecordingNotifications implements BillingNotificationPort {
  graceStarted: { workspacePublicId: string; gracePeriodEndsAt: Date }[] = []
  suspended: string[] = []
  recovered: { workspacePublicId: string; ctx: BillingRecoveryContext }[] = []

  async onGraceStarted(workspacePublicId: string, gracePeriodEndsAt: Date): Promise<void> {
    this.graceStarted.push({ workspacePublicId, gracePeriodEndsAt })
  }

  async onSuspendedNonPayment(workspacePublicId: string): Promise<void> {
    this.suspended.push(workspacePublicId)
  }

  async onPaymentRecovered(workspacePublicId: string, ctx: BillingRecoveryContext): Promise<void> {
    this.recovered.push({ workspacePublicId, ctx })
  }
}

class MemAudit implements WorkspaceBillingAuditRepository {
  async append(
    workspacePublicId: string,
    _eventType: BillingAuditEventType,
    _payload: Record<string, unknown>,
  ): Promise<void> {
    void workspacePublicId
  }

  async listRecentByWorkspacePublicId(
    _workspacePublicId: string,
    _limit: number,
  ): Promise<Array<{ eventType: string; payload: Record<string, unknown>; createdAt: Date }>> {
    return []
  }

  async findLatestAttentionEventsByWorkspaceIds(
    _workspacePublicIds: string[],
    _eventTypes: readonly string[],
  ): Promise<Map<string, { eventType: string; createdAt: Date }>> {
    return new Map()
  }
}

class MemLicense implements Pick<WorkspaceLicenseService, "getSummary"> {
  constructor(private readonly summary: WorkspaceLicenseSummary) {}

  async getSummary(workspacePublicId: string): Promise<WorkspaceLicenseSummary | null> {
    return workspacePublicId === WS ? this.summary : null
  }
}

function licenseBase(): WorkspaceLicenseSummary {
  const next = new Date("2026-02-01T00:00:00.000Z")
  return {
    workspacePublicId: WS,
    seatsPurchased: 3,
    seatsAssigned: 2,
    seatsAvailable: 1,
    pendingSeatReduction: null,
    nextRenewalDate: next,
    lastRenewalAt: new Date("2026-01-01T00:00:00.000Z"),
  }
}

function createService(notifications?: BillingNotificationPort) {
  const snaps = new MemSnap()
  const audit = new MemAudit()
  const license = new MemLicense(licenseBase())
  const svc = new WorkspaceBillingStateService(
    snaps,
    audit,
    { async countActiveSeatConsumingMembers() {
      return 1
    } },
    license,
    notifications,
    null,
  )
  return { svc, snaps }
}

function createSweepService(notifications: BillingNotificationPort) {
  const snaps = new MemSnapForSweep()
  const audit = new MemAudit()
  const license = new MemLicense(licenseBase())
  const svc = new WorkspaceBillingStateService(
    snaps,
    audit,
    { async countActiveSeatConsumingMembers() {
      return 1
    } },
    license,
    notifications,
    null,
  )
  return { svc, snaps }
}

test("grace expiry escalates to suspended_non_payment", async () => {
  const { svc, snaps } = createService()
  await svc.applyPaymentRenewalFailure(WS, new Date("2026-01-01T00:00:00.000Z"))
  assert.ok(snaps.row)
  assert.equal(snaps.row!.billingStatus, "grace_period")
  const afterGrace = new Date(snaps.row!.gracePeriodEndsAt!.getTime() + 60_000)
  const state = await svc.getBillingState(WS, afterGrace)
  assert.equal(state.billingStatus, "suspended_non_payment")
  assert.equal(state.guards.canInviteSeatConsumingMembers, false)
})

test("applyPaymentRecovered clears grace", async () => {
  const { svc, snaps } = createService()
  await svc.applyPaymentRenewalFailure(WS, new Date())
  await svc.applyPaymentRecovered(WS, new Date())
  await svc.getBillingState(WS, new Date())
  assert.equal(snaps.row!.billingStatus, "active")
})

test("computeGraceEndsAt: 2026-03-01 UTC +15d ⇒ 2026-03-16 same clock", () => {
  const s = new Date("2026-03-01T10:00:00.000Z")
  const e = computeGraceEndsAtInclusivePattern(s)
  assert.equal(e.toISOString(), "2026-03-16T10:00:00.000Z")
})

test("applyPaymentRenewalFailure dispara hook de inicio de gracia", async () => {
  const rec = new RecordingNotifications()
  const { svc } = createService(rec)
  const at = new Date("2026-01-01T00:00:00.000Z")
  await svc.applyPaymentRenewalFailure(WS, at)
  assert.equal(rec.graceStarted.length, 1)
  assert.equal(rec.graceStarted[0]!.workspacePublicId, WS)
  assert.equal(rec.graceStarted[0]!.gracePeriodEndsAt.toISOString(), computeGraceEndsAtInclusivePattern(at).toISOString())
})

test("post-gracia: getBillingState dispara suspensión por impago (hook)", async () => {
  const rec = new RecordingNotifications()
  const { svc } = createService(rec)
  await svc.applyPaymentRenewalFailure(WS, new Date("2026-01-01T00:00:00.000Z"))
  const afterGrace = new Date(rec.graceStarted[0]!.gracePeriodEndsAt.getTime() + 60_000)
  await svc.getBillingState(WS, afterGrace)
  assert.deepEqual(rec.suspended, [WS])
})

test("sweepExpiredGraceSuspensions materializa suspensión y notifica", async () => {
  const rec = new RecordingNotifications()
  const { svc } = createSweepService(rec)
  await svc.applyPaymentRenewalFailure(WS, new Date("2026-01-01T00:00:00.000Z"))
  const afterGrace = new Date(rec.graceStarted[0]!.gracePeriodEndsAt.getTime() + 60_000)
  await svc.sweepExpiredGraceSuspensions(afterGrace)
  assert.deepEqual(rec.suspended, [WS])
})

test("applyPaymentRecovered dispara hook con contexto previo", async () => {
  const rec = new RecordingNotifications()
  const { svc } = createService(rec)
  await svc.applyPaymentRenewalFailure(WS, new Date())
  await svc.applyPaymentRecovered(WS, new Date())
  assert.equal(rec.recovered.length, 1)
  assert.equal(rec.recovered[0]!.workspacePublicId, WS)
  assert.equal(rec.recovered[0]!.ctx.wasSuspended, false)
  assert.ok(rec.recovered[0]!.ctx.priorGracePeriodEndsAt)
})

test("franja messagingBand late durante gracia avanzada", async () => {
  const { svc } = createService()
  const graceStart = new Date("2026-01-01T12:00:00.000Z")
  await svc.applyPaymentRenewalFailure(WS, graceStart)
  const day10 = new Date(graceStart.getTime() + 10 * 24 * 60 * 60 * 1000)
  const state = await svc.getBillingState(WS, day10)
  assert.equal(state.grace.messagingBand, "late")
})
