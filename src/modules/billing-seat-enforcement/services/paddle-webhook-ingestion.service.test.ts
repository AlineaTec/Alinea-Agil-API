import assert from "node:assert/strict"
import { test } from "node:test"

import type { WorkspaceBillingSnapshotProps } from "../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingSnapshotRepository } from "../persistence/workspace-billing-snapshot.repository.js"
import type { PaddleWebhookProcessedRepository } from "../persistence/paddle-webhook-processed.repository.js"
import type { WorkspaceLicenseSummary } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseService } from "../../workspace-licenses/services/workspace-license.service.js"
import { PaddleBillingWebhookIngestionService } from "./paddle-webhook-ingestion.service.js"
import type { PaymentReceiptWebhookBridge } from "../../payment-receipts/services/payment-receipt-webhook.bridge.js"
import { WorkspaceBillingStateService } from "./workspace-billing-state.service.js"
import type { WorkspaceBillingAuditRepository } from "../persistence/workspace-billing-audit.repository.js"
import type { BillingAuditEventType } from "../domain/workspace-billing-snapshot.js"

const WS = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"

function baseLicense(): WorkspaceLicenseSummary {
  const next = new Date("2026-08-01T00:00:00.000Z")
  return {
    workspacePublicId: WS,
    seatsPurchased: 3,
    seatsAssigned: 2,
    seatsAvailable: 1,
    pendingSeatReduction: null,
    nextRenewalDate: next,
    lastRenewalAt: new Date("2026-07-01T00:00:00.000Z"),
  }
}

class MemProcessed implements PaddleWebhookProcessedRepository {
  private readonly ids = new Set<string>()
  async tryClaimEvent(eventId: string, _meta: { eventType: string; receivedAt: Date }): Promise<boolean> {
    if (this.ids.has(eventId)) return false
    this.ids.add(eventId)
    return true
  }
}

class MemSnap implements WorkspaceBillingSnapshotRepository {
  row: WorkspaceBillingSnapshotProps | null = null

  constructor(private readonly subIndex = new Map<string, string>()) {}

  async findByWorkspacePublicId(workspacePublicId: string) {
    return workspacePublicId === WS ? this.row : null
  }

  async findBySubscriptionExternalId(subscriptionExternalId: string) {
    const ws = this.subIndex.get(subscriptionExternalId)
    return ws === WS ? this.row : null
  }

  async insertInitial(row: WorkspaceBillingSnapshotProps) {
    this.row = row
  }

  async replace(row: WorkspaceBillingSnapshotProps) {
    this.row = row
  }

  async findPaddleLinkedWorkspacePublicIds(_limit: number): Promise<string[]> {
    return this.row?.workspacePublicId === WS && this.row?.billingSource === "paddle" && this.row.subscriptionExternalId
      ? [WS]
      : []
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

  linkSub(subId: string) {
    this.subIndex.set(subId, WS)
  }
}

class MemAudit implements WorkspaceBillingAuditRepository {
  async append(
    _w: string,
    _t: BillingAuditEventType,
    _p: Record<string, unknown>,
  ): Promise<void> {}

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
    this.summary = {
      ...this.summary,
      seatsPurchased,
      seatsAvailable: seatsPurchased - this.summary.seatsAssigned,
    }
    return this.summary
  }
}

function createStack(bridge?: PaymentReceiptWebhookBridge | null) {
  const snaps = new MemSnap()
  const audit = new MemAudit()
  const license = new MemLicense(baseLicense()) as unknown as WorkspaceLicenseService
  const billing = new WorkspaceBillingStateService(snaps, audit, { async countActiveSeatConsumingMembers() {
    return 1
  } }, license, undefined, null)
  const processed = new MemProcessed()
  const ingestion = new PaddleBillingWebhookIngestionService(snaps, processed, billing, license, bridge ?? null)
  return { snaps, billing, license, ingestion, processed }
}

test("past_due → gracia (subscription.updated)", async () => {
  const { snaps, billing, ingestion } = createStack()
  await billing.getBillingState(WS)
  assert.ok(snaps.row)

  const r = await ingestion.handleEnvelope(
    {
      event_id: "evt_past_1",
      event_type: "subscription.updated",
      occurred_at: "2026-06-15T12:00:00.000Z",
      data: {
        id: "sub_test",
        status: "past_due",
        custom_data: { workspace_public_id: WS },
        items: [{ quantity: 3 }],
      },
    },
    new Date(),
  )
  assert.equal(r.status, 200)
  await billing.getBillingState(WS, new Date("2026-06-16T00:00:00.000Z"))
  assert.equal(snaps.row!.billingStatus, "grace_period")
})

test("past_due → gracia (subscription.past_due, evento dedicado Paddle)", async () => {
  const { snaps, billing, ingestion } = createStack()
  await billing.getBillingState(WS)
  assert.ok(snaps.row)

  const r = await ingestion.handleEnvelope(
    {
      event_id: "evt_past_due_dedicated",
      event_type: "subscription.past_due",
      occurred_at: "2026-06-15T12:00:00.000Z",
      data: {
        id: "sub_dedicated",
        status: "past_due",
        custom_data: { workspace_public_id: WS },
        items: [{ quantity: 3 }],
      },
    },
    new Date(),
  )
  assert.equal(r.status, 200)
  assert.equal((r.body as { effect?: string }).effect, "renewal_failure_grace")
  assert.equal(snaps.row!.billingStatus, "grace_period")
})

test("past_due → gracia (transaction.past_due)", async () => {
  const { snaps, billing, ingestion } = createStack()
  await billing.getBillingState(WS)
  assert.ok(snaps.row)

  const r = await ingestion.handleEnvelope(
    {
      event_id: "evt_txn_past",
      event_type: "transaction.past_due",
      occurred_at: "2026-06-15T12:00:00.000Z",
      data: {
        id: "txn_1",
        subscription_id: "sub_from_txn",
        custom_data: { workspace_public_id: WS },
        items: [{ quantity: 3 }],
      },
    },
    new Date(),
  )
  assert.equal(r.status, 200)
  assert.equal((r.body as { effect?: string }).effect, "renewal_failure_grace")
  assert.equal(snaps.row!.billingStatus, "grace_period")
})

test("activo + scheduled_change futuro no aumenta seatsPurchased en licencia", async () => {
  const { snaps, license, ingestion } = createStack()
  await ingestion.handleEnvelope(
    {
      event_id: "evt_sched_1",
      event_type: "subscription.updated",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "sub_sched",
        status: "active",
        custom_data: { workspace_public_id: WS },
        items: [{ quantity: 3 }],
        scheduled_change: {
          effective_at: "2026-08-01T00:00:00.000Z",
          items: [{ quantity: 10 }],
        },
      },
    },
    new Date(),
  )
  assert.equal(license.summary.seatsPurchased, 3)
  assert.equal(snaps.row!.paddleScheduledEntitledSeats, 10)
})

test("activo + cambio efectivo de qty actualiza licencia", async () => {
  const { license, ingestion } = createStack()
  await ingestion.handleEnvelope(
    {
      event_id: "evt_cap_1",
      event_type: "subscription.updated",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "sub_cap",
        status: "active",
        custom_data: { workspace_public_id: WS },
        items: [{ quantity: 7 }],
      },
    },
    new Date(),
  )
  assert.equal(license.summary.seatsPurchased, 7)
})

test("event_id duplicado no reaplica efectos", async () => {
  const { snaps, billing, ingestion } = createStack()
  await billing.getBillingState(WS)
  const env = {
    event_id: "evt_dup",
    event_type: "subscription.updated",
    occurred_at: "2026-06-01T12:00:00.000Z",
    data: {
      id: "sub_dup",
      status: "past_due",
      custom_data: { workspace_public_id: WS },
      items: [{ quantity: 3 }],
    },
  }
  await ingestion.handleEnvelope(env, new Date())
  const graceEnds = snaps.row!.gracePeriodEndsAt
  await ingestion.handleEnvelope(env, new Date())
  assert.equal(snaps.row!.gracePeriodEndsAt?.getTime(), graceEnds?.getTime())
})

test("resolución por subscriptionExternalId en snapshot", async () => {
  const { snaps, billing, ingestion } = createStack()
  await billing.getBillingState(WS)
  snaps.linkSub("sub_lookup")
  await ingestion.handleEnvelope(
    {
      event_id: "evt_lookup_1",
      event_type: "subscription.updated",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "sub_lookup",
        status: "active",
        items: [{ quantity: 4 }],
      },
    },
    new Date(),
  )
  assert.equal(snaps.row!.subscriptionExternalId, "sub_lookup")
})

test("transaction.completed invokes payment receipt bridge after workspace resolution", async () => {
  let emitted = 0
  const bridge = {
    async recordOrphanPaddleTransactionCompleted() {},
    async tryEmitFromPaddleTransactionCompleted() {
      emitted += 1
      return { emitted: true }
    },
  } as unknown as PaymentReceiptWebhookBridge
  const { billing, ingestion } = createStack(bridge)
  await billing.getBillingState(WS)
  const r = await ingestion.handleEnvelope(
    {
      event_id: "evt_txn_done",
      event_type: "transaction.completed",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "txn_rcpt",
        subscription_id: "sub_rcpt",
        currency_code: "EUR",
        custom_data: { workspace_public_id: WS },
        details: { totals: { total: "500", subtotal: "500" } },
        items: [{ quantity: 3 }],
      },
    },
    new Date(),
  )
  assert.equal(r.status, 200)
  assert.equal(emitted, 1)
})

test("transaction.completed orphan records bridge when workspace missing", async () => {
  let orphans = 0
  const bridge = {
    async recordOrphanPaddleTransactionCompleted() {
      orphans += 1
    },
    async tryEmitFromPaddleTransactionCompleted() {
      throw new Error("should not emit without workspace")
    },
  } as unknown as PaymentReceiptWebhookBridge
  const { ingestion } = createStack(bridge)
  const r = await ingestion.handleEnvelope(
    {
      event_id: "evt_txn_orphan",
      event_type: "transaction.completed",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "txn_orphan",
        currency_code: "EUR",
        details: { totals: { total: "500" } },
      },
    },
    new Date(),
  )
  assert.equal(r.status, 200)
  assert.equal((r.body as { orphan?: boolean }).orphan, true)
  assert.equal(orphans, 1)
})

test("transaction.payment_failed does not invoke receipt emit bridge", async () => {
  let emitted = 0
  const bridge = {
    async recordOrphanPaddleTransactionCompleted() {},
    async tryEmitFromPaddleTransactionCompleted() {
      emitted += 1
      return { emitted: true }
    },
  } as unknown as PaymentReceiptWebhookBridge
  const { billing, ingestion } = createStack(bridge)
  await billing.getBillingState(WS)
  await ingestion.handleEnvelope(
    {
      event_id: "evt_pay_fail",
      event_type: "transaction.payment_failed",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "txn_fail",
        subscription_id: "sub_fail",
        custom_data: { workspace_public_id: WS },
      },
    },
    new Date(),
  )
  assert.equal(emitted, 0)
})

test("cancelación subscription.updated", async () => {
  const { snaps, ingestion } = createStack()
  await ingestion.handleEnvelope(
    {
      event_id: "evt_cancel",
      event_type: "subscription.updated",
      occurred_at: "2026-06-01T12:00:00.000Z",
      data: {
        id: "sub_x",
        status: "canceled",
        custom_data: { workspace_public_id: WS },
        items: [{ quantity: 3 }],
      },
    },
    new Date(),
  )
  assert.equal(snaps.row!.billingStatus, "cancelled")
})
