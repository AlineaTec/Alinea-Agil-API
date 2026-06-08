import assert from "node:assert/strict"
import { test } from "node:test"

import type { BillingAuditEventType, WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingAuditRepository } from "../persistence/workspace-billing-audit.repository.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import type { WorkspaceLicenseSummary } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import { SeatCapacityInvariantError } from "../../workspace-licenses/domain/seat-capacity.policy.js"
import { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"
import {
  PaddleCommercialReconcileService,
  type PaddleSubscriptionFetchFn,
} from "./paddle-commercial-reconcile.service.js"

const WS = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"

type AuditRow = { type: string; payload: Record<string, unknown> }

class MemSnap implements WorkspaceBillingSnapshotRepository {
  row: WorkspaceBillingSnapshotProps | null = null

  async findByWorkspacePublicId(workspacePublicId: string) {
    return workspacePublicId === WS ? this.row : null
  }

  async findBySubscriptionExternalId(_subscriptionExternalId: string) {
    return null
  }

  async insertInitial(row: WorkspaceBillingSnapshotProps) {
    this.row = row
  }

  async replace(row: WorkspaceBillingSnapshotProps) {
    this.row = row
  }

  async findPaddleLinkedWorkspacePublicIds(limit: number): Promise<string[]> {
    if (!this.row || this.row.billingSource !== "paddle" || !this.row.subscriptionExternalId) return []
    return limit > 0 ? [WS] : []
  }

  async findGraceSnapshotsEndingWithin(
    _now: Date,
    _lookaheadMs: number,
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }

  async findSnapshotsWithGraceExpiredBefore(_now: Date): Promise<WorkspaceBillingSnapshotProps[]> {
    return []
  }

  async countForPlatformFilter(): Promise<number> {
    return this.row ? 1 : 0
  }

  async findForPlatformFilter(
    _filter: unknown,
    _opts: { skip: number; limit: number },
  ): Promise<WorkspaceBillingSnapshotProps[]> {
    return this.row ? [this.row] : []
  }
}

class MemAudit implements WorkspaceBillingAuditRepository {
  readonly events: AuditRow[] = []

  async append(workspacePublicId: string, eventType: BillingAuditEventType, payload: Record<string, unknown>): Promise<void> {
    void workspacePublicId
    this.events.push({ type: eventType, payload })
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

class MemLicense implements WorkspaceLicenseService {
  constructor(public summary: WorkspaceLicenseSummary) {}

  async getSummary(workspacePublicId: string) {
    return workspacePublicId === WS ? this.summary : null
  }

  async seedNewWorkspace() {
    throw new Error("not_used")
  }
  async increaseSeats() {
    throw new Error("not_used")
  }
  async scheduleSeatReduction() {
    throw new Error("not_used")
  }
  async clearScheduledReduction() {
    throw new Error("not_used")
  }
  async applyRenewalIfDue() {
    throw new Error("not_used")
  }
  async adjustAssignedSeats() {
    throw new Error("not_used")
  }
  async getSeatsAvailable() {
    return null
  }

  async applyTrustedAbsoluteSeatsPurchased(
    workspacePublicId: string,
    seatsPurchased: number,
    _audit?: { actorUserPublicId: string },
  ) {
    if (workspacePublicId !== WS) throw new Error("bad ws")
    if (seatsPurchased < this.summary.seatsAssigned) {
      throw new SeatCapacityInvariantError(
        `seatsPurchased (${seatsPurchased}) must be >= seatsAssigned (${this.summary.seatsAssigned})`,
      )
    }
    this.summary = {
      ...this.summary,
      seatsPurchased,
      seatsAvailable: seatsPurchased - this.summary.seatsAssigned,
    }
    return this.summary
  }
}

function licenseBase(over: Partial<WorkspaceLicenseSummary> = {}): WorkspaceLicenseSummary {
  const next = new Date("2026-08-01T00:00:00.000Z")
  return {
    workspacePublicId: WS,
    seatsPurchased: 5,
    seatsAssigned: 3,
    seatsAvailable: 2,
    pendingSeatReduction: null,
    nextRenewalDate: next,
    lastRenewalAt: new Date("2026-07-01T00:00:00.000Z"),
    ...over,
  }
}

function createDeps(fetch: PaddleSubscriptionFetchFn) {
  const snaps = new MemSnap()
  const audit = new MemAudit()
  const license = new MemLicense(licenseBase()) as unknown as WorkspaceLicenseService
  const billing = new WorkspaceBillingStateService(snaps, audit, { async countActiveSeatConsumingMembers() {
    return 1
  } }, license, undefined, null)
  const reconcile = new PaddleCommercialReconcileService(billing, license, snaps, fetch, () => "test-api-key")
  return { snaps, audit, license, billing, reconcile }
}

test("reconcile ignora billing manual", async () => {
  const fetch: PaddleSubscriptionFetchFn = async () => {
    throw new Error("should not fetch")
  }
  const { reconcile, snaps, billing } = createDeps(fetch)
  await billing.reconcileSnapshotFromLicense(WS, new Date())
  assert.ok(snaps.row)
  snaps.row!.billingSource = "manual"
  const r = await reconcile.reconcileWorkspace(WS, new Date())
  assert.equal(r.status, "skipped")
  assert.equal(r.reason, "manual_billing")
})

test("reconcile restaura lastCommercialSyncAt y huella comercial desde API simulada", async () => {
  const now = new Date("2026-06-15T12:00:00.000Z")
  const fetch: PaddleSubscriptionFetchFn = async () => ({
    ok: true,
    data: {
      id: "sub_123",
      status: "active",
      items: [{ quantity: 5 }],
      current_billing_period: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z",
      },
      next_billed_at: "2026-07-01T00:00:00.000Z",
    },
  })
  const { reconcile, snaps, billing } = createDeps(fetch)
  await billing.reconcileSnapshotFromLicense(WS, now)
  snaps.row!.subscriptionExternalId = "sub_123"
  snaps.row!.lastCommercialSyncAt = null

  const r = await reconcile.reconcileWorkspace(WS, now)
  assert.equal(r.status, "applied")
  assert.ok(snaps.row!.lastCommercialSyncAt)
  assert.ok(snaps.row!.commercialExternalSnapshot?.includes("paddle_api_reconcile"))
  assert.equal(snaps.row!.currentEntitledSeats, 5)
})

test("reconcile solo futuro Paddle no sube entitlement actual (scheduled_change)", async () => {
  const now = new Date("2026-06-15T12:00:00.000Z")
  const future = new Date("2026-08-01T00:00:00.000Z")
  const fetch: PaddleSubscriptionFetchFn = async () => ({
    ok: true,
    data: {
      id: "sub_x",
      status: "active",
      items: [{ quantity: 5 }],
      scheduled_change: {
        effective_at: future.toISOString(),
        items: [{ quantity: 8 }],
      },
    },
  })
  const { reconcile, snaps, billing } = createDeps(fetch)
  await billing.reconcileSnapshotFromLicense(WS, now)
  snaps.row!.subscriptionExternalId = "sub_x"

  await reconcile.reconcileWorkspace(WS, now)
  assert.equal(snaps.row!.currentEntitledSeats, 5)
  assert.equal(snaps.row!.paddleScheduledEntitledSeats, 8)
  assert.ok(snaps.row!.paddleScheduledSeatChangeEffectiveAt)
})

test("reconcile terminal canceled alinea billingStatus", async () => {
  const now = new Date("2026-06-15T12:00:00.000Z")
  const fetch: PaddleSubscriptionFetchFn = async () => ({
    ok: true,
    data: {
      id: "sub_z",
      status: "canceled",
      items: [{ quantity: 5 }],
    },
  })
  const { reconcile, snaps, billing } = createDeps(fetch)
  await billing.reconcileSnapshotFromLicense(WS, now)
  snaps.row!.subscriptionExternalId = "sub_z"

  await reconcile.reconcileWorkspace(WS, now)
  assert.equal(snaps.row!.billingStatus, "cancelled")
})

test("reconcile idempotente segunda corrida sin errores", async () => {
  const now = new Date("2026-06-15T12:00:00.000Z")
  const fetch: PaddleSubscriptionFetchFn = async () => ({
    ok: true,
    data: {
      id: "sub_idem",
      status: "active",
      items: [{ quantity: 5 }],
    },
  })
  const { reconcile, snaps, billing } = createDeps(fetch)
  await billing.reconcileSnapshotFromLicense(WS, now)
  snaps.row!.subscriptionExternalId = "sub_idem"

  const a = await reconcile.reconcileWorkspace(WS, now)
  const b = await reconcile.reconcileWorkspace(WS, now)
  assert.equal(a.status, "applied")
  assert.equal(b.status, "applied")
  assert.equal(snaps.row!.currentEntitledSeats, 5)
})

test("reconcile detecta conflicto licencia vs Paddle (no relaja asientos asignados)", async () => {
  const now = new Date("2026-06-15T12:00:00.000Z")
  const fetch: PaddleSubscriptionFetchFn = async () => ({
    ok: true,
    data: {
      id: "sub_bad",
      status: "active",
      items: [{ quantity: 2 }],
    },
  })
  const { reconcile, snaps, billing, audit } = createDeps(fetch)
  const license = new MemLicense(
    licenseBase({ seatsPurchased: 10, seatsAssigned: 8, seatsAvailable: 2 }),
  ) as unknown as WorkspaceLicenseService
  const billing2 = new WorkspaceBillingStateService(snaps, audit, { async countActiveSeatConsumingMembers() {
    return 1
  } }, license, undefined, null)
  const reconcile2 = new PaddleCommercialReconcileService(billing2, license, snaps, fetch, () => "test-api-key")
  await billing2.reconcileSnapshotFromLicense(WS, now)
  snaps.row!.subscriptionExternalId = "sub_bad"

  const r = await reconcile2.reconcileWorkspace(WS, now)
  assert.equal(r.status, "license_conflict")
  assert.ok(audit.events.some((e) => e.type === "paddle_commercial_reconcile_license_conflict"))
})

test("sin API key no llama fetch", async () => {
  const calls: string[] = []
  const fetch: PaddleSubscriptionFetchFn = async (id: string) => {
    calls.push(id)
    return { ok: true, data: { id: "x", status: "active", items: [{ quantity: 1 }] } }
  }
  const snaps = new MemSnap()
  const audit = new MemAudit()
  const license = new MemLicense(licenseBase({ seatsPurchased: 3 })) as unknown as WorkspaceLicenseService
  const billing = new WorkspaceBillingStateService(snaps, audit, { async countActiveSeatConsumingMembers() {
    return 1
  } }, license, undefined, null)
  const reconcile = new PaddleCommercialReconcileService(billing, license, snaps, fetch, () => undefined)
  await billing.reconcileSnapshotFromLicense(WS, new Date())
  snaps.row!.subscriptionExternalId = "sub_x"

  const r = await reconcile.reconcileWorkspace(WS, new Date())
  assert.equal(r.status, "skipped")
  assert.equal(r.reason, "missing_api_key")
  assert.equal(calls.length, 0)
})
