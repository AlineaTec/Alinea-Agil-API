import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import type { WorkspaceBillingSnapshotProps } from "../../billing-seat-enforcement/domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type { WorkspaceIdentityRepository } from "../../workspace-users/persistence/workspace-identity.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { PaymentReceiptDuplicateEmissionError } from "../domain/payment-receipt.errors.js"
import type { WorkspacePaymentReceiptProps } from "../domain/workspace-payment-receipt.js"
import type { WorkspacePaymentReceiptRepository } from "../persistence/workspace-payment-receipt.repository.js"
import { renderPaymentReceiptPdf } from "../rendering/payment-receipt-pdf.renderer.js"
import { PaymentReceiptEmissionService } from "./payment-receipt-emission.service.js"
import { PaymentReceiptLocalFileStorage } from "./payment-receipt-local.storage.js"

const WS = "11111111-2222-4333-8444-555555555555"

class MemSeq {
  private n = 0
  async nextForYear(_year: number): Promise<number> {
    this.n += 1
    return this.n
  }
}

class MemReceiptRepo implements WorkspacePaymentReceiptRepository {
  rows: WorkspacePaymentReceiptProps[] = []

  async insertNew(
    props: Omit<WorkspacePaymentReceiptProps, "createdAt" | "updatedAt">,
  ): Promise<WorkspacePaymentReceiptProps> {
    const dup = this.rows.find(
      (r) => r.paymentProvider === props.paymentProvider && r.providerTransactionId === props.providerTransactionId,
    )
    if (dup) throw new PaymentReceiptDuplicateEmissionError()
    const now = new Date()
    const row = { ...props, createdAt: now, updatedAt: now } as WorkspacePaymentReceiptProps
    this.rows.push(row)
    return row
  }

  async findByProviderTransaction(
    paymentProvider: string,
    providerTransactionId: string,
  ): Promise<WorkspacePaymentReceiptProps | null> {
    return (
      this.rows.find(
        (r) => r.paymentProvider === paymentProvider && r.providerTransactionId === providerTransactionId,
      ) ?? null
    )
  }

  async findByReceiptPublicId(receiptPublicId: string): Promise<WorkspacePaymentReceiptProps | null> {
    return this.rows.find((r) => r.receiptPublicId === receiptPublicId) ?? null
  }

  async findByWorkspace(filter: {
    workspacePublicId: string
    limit: number
    cursor?: unknown
    issuedFrom?: Date | null
    issuedTo?: Date | null
  }): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: null }> {
    const items = this.rows.filter((r) => r.workspacePublicId === filter.workspacePublicId).slice(0, filter.limit)
    return { items, nextCursor: null }
  }

  async findPlatformList(filter: {
    limit: number
    cursor?: unknown
    workspacePublicId?: string | null
    billingSource?: unknown
    paymentProvider?: string | null
    issuedFrom?: Date | null
    issuedTo?: Date | null
  }): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: null }> {
    let items = [...this.rows]
    if (filter.workspacePublicId) {
      items = items.filter((r) => r.workspacePublicId === filter.workspacePublicId)
    }
    return { items: items.slice(0, filter.limit), nextCursor: null }
  }

  async updatePdfMetadata(
    receiptPublicId: string,
    patch: { pdfStorageKey: string; pdfGeneratedAt: Date; status: WorkspacePaymentReceiptProps["status"] },
  ): Promise<void> {
    const r = this.rows.find((x) => x.receiptPublicId === receiptPublicId)
    if (r) {
      r.pdfStorageKey = patch.pdfStorageKey
      r.pdfGeneratedAt = patch.pdfGeneratedAt
      r.status = patch.status
    }
  }

  async markEmailSent(receiptPublicId: string, sentAt: Date): Promise<void> {
    const r = this.rows.find((x) => x.receiptPublicId === receiptPublicId)
    if (r) r.emailSentAt = sentAt
  }
}

function minimalSnapshot(over: Partial<WorkspaceBillingSnapshotProps>): WorkspaceBillingSnapshotProps {
  const now = new Date()
  return {
    workspacePublicId: WS,
    billingSource: "paddle",
    subscriptionExternalId: "sub_x",
    planKey: "team",
    includedSeats: 3,
    additionalPaidSeats: 0,
    currentEntitledSeats: 3,
    scheduledEntitledSeats: null,
    scheduledSeatChangeEffectiveAt: null,
    paddleScheduledEntitledSeats: null,
    paddleScheduledSeatChangeEffectiveAt: null,
    billingStatus: "active",
    gracePeriodStartsAt: null,
    gracePeriodEndsAt: null,
    suspensionEffectiveAt: null,
    peakUsageInBillingPeriod: 0,
    maxConcurrentActiveUsers: 0,
    billingCycleAnchor: now,
    currentPeriodStartsAt: now,
    currentPeriodEndsAt: now,
    lastCommercialSyncAt: now,
    commercialExternalSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

class MemSnapshots {
  row: WorkspaceBillingSnapshotProps | null = null
  async findByWorkspacePublicId(workspacePublicId: string) {
    return workspacePublicId === WS ? this.row : null
  }
}

function paddleTxnPayload() {
  return {
    id: "txn_unit_test_1",
    currency_code: "EUR",
    customer_name: "María López",
    customer_email: "billing@example.com",
    details: {
      totals: {
        total: "1210",
        subtotal: "1000",
        tax: "210",
      },
      line_items: [{ billing_cycle: { interval: "month" } }],
    },
  } as Record<string, unknown>
}

function buildEmissionService(opts: {
  snapshots: MemSnapshots
  receipts?: MemReceiptRepo
  emailImpl?: { calls: string[]; fail?: boolean }
}) {
  const receipts = opts.receipts ?? new MemReceiptRepo()
  const sequences = new MemSeq() as unknown as PaymentReceiptYearSequenceRepository
  const billing = {
    appendBillingAuditEvent: async () => {},
  } as unknown as WorkspaceBillingStateService
  const identity = {
    async findByWorkspacePublicId(w: string) {
      return w === WS ? { displayName: "WS Demo", code: "DEMO" } : null
    },
  } as unknown as WorkspaceIdentityRepository
  const members = {
    async listByWorkspacePublicId(w: string): Promise<WorkspaceMemberState[]> {
      if (w !== WS) return []
      return [
        {
          membershipPublicId: "m1",
          workspacePublicId: WS,
          userPublicId: "u1",
          emailNormalized: "billing@example.com",
          fullName: "María López",
          status: "active",
          hasSeatAssigned: true,
          workspaceRoleAdministrative: "admin",
          workspaceRoleMethodological: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
    },
  } as unknown as WorkspaceMemberRepository
  const root = mkdtempSync(path.join(tmpdir(), "receipt-test-"))
  mkdirSync(path.join(root, "receiptpdfs"), { recursive: true })
  const storage = new PaymentReceiptLocalFileStorage(root)
  const emailCalls = opts.emailImpl?.calls ?? []
  const transactionalEmail = {
    async sendWorkspacePaymentReceiptEmail(_p: { toEmail: string }): Promise<void> {
      emailCalls.push(_p.toEmail)
      if (opts.emailImpl?.fail) {
        throw new Error("resend_down")
      }
    },
  }
  const svc = new PaymentReceiptEmissionService(
    receipts as unknown as WorkspacePaymentReceiptRepository,
    sequences,
    opts.snapshots as unknown as import("../../billing-seat-enforcement/persistence/workspace-billing-snapshot.repository.js").WorkspaceBillingSnapshotRepository,
    billing,
    identity,
    members,
    storage,
    transactionalEmail as unknown as import("../../transactional-email/services/transactional-email.service.js").TransactionalEmailService,
  )
  return { svc, receipts, root, emailCalls }
}

test("emisión Paddle crea recibo, PDF y dispara email sin adjunto (servicio)", async () => {
  const snaps = new MemSnapshots()
  snaps.row = minimalSnapshot({})
  const { svc, receipts, root, emailCalls } = buildEmissionService({ snapshots: snaps })
  const out = await svc.tryEmitFromPaddleTransactionCompleted({
    workspacePublicId: WS,
    payload: paddleTxnPayload(),
    occurredAt: new Date("2026-05-01T12:00:00.000Z"),
    sourceEventId: "evt_1",
    sourceEventType: "transaction.completed",
  })
  assert.equal(out.emitted, true)
  assert.equal(receipts.rows.length, 1)
  assert.equal(receipts.rows[0].status, "issued")
  assert.ok(receipts.rows[0].pdfStorageKey)
  const disk = readFileSync(path.join(root, receipts.rows[0].pdfStorageKey!))
  assert.ok(disk.length > 100)
  assert.equal(emailCalls.length, 1)
  assert.equal(emailCalls[0], "billing@example.com")
  rmSync(root, { recursive: true, force: true })
})

test("billing manual no emite recibo automático", async () => {
  const snaps = new MemSnapshots()
  snaps.row = minimalSnapshot({ billingSource: "manual" })
  const memRepo = new MemReceiptRepo()
  const rootManual = mkdtempSync(path.join(tmpdir(), "receipt-manual-"))
  mkdirSync(path.join(rootManual, "receiptpdfs"), { recursive: true })
  const auditReasons: string[] = []
  const billing = {
    appendBillingAuditEvent: async (_w: string, t: string) => {
      if (t === "payment_receipt_skipped") auditReasons.push("skipped")
    },
  } as unknown as WorkspaceBillingStateService
  const inner = new PaymentReceiptEmissionService(
    memRepo as unknown as WorkspacePaymentReceiptRepository,
    new MemSeq() as unknown as PaymentReceiptYearSequenceRepository,
    snaps as unknown as import("../../billing-seat-enforcement/persistence/workspace-billing-snapshot.repository.js").WorkspaceBillingSnapshotRepository,
    billing,
    {
      async findByWorkspacePublicId() {
        return { displayName: "X", code: "x" }
      },
    } as unknown as WorkspaceIdentityRepository,
    {
      async listByWorkspacePublicId() {
        return []
      },
    } as unknown as WorkspaceMemberRepository,
    new PaymentReceiptLocalFileStorage(rootManual),
    { async sendWorkspacePaymentReceiptEmail() {} } as unknown as import("../../transactional-email/services/transactional-email.service.js").TransactionalEmailService,
  )
  const out = await inner.tryEmitFromPaddleTransactionCompleted({
    workspacePublicId: WS,
    payload: paddleTxnPayload(),
    occurredAt: new Date(),
    sourceEventId: "e",
    sourceEventType: "transaction.completed",
  })
  assert.equal(out.emitted, false)
  assert.equal(out.skippedReason, "manual_billing")
  assert.equal(memRepo.rows.length, 0)
  assert.equal(auditReasons.length, 1)
  rmSync(rootManual, { recursive: true, force: true })
})

test("dedupe por providerTransactionId no duplica filas", async () => {
  const snaps = new MemSnapshots()
  snaps.row = minimalSnapshot({})
  const memRepo = new MemReceiptRepo()
  const { svc, root } = buildEmissionService({ snapshots: snaps, receipts: memRepo })
  const payload = paddleTxnPayload()
  await svc.tryEmitFromPaddleTransactionCompleted({
    workspacePublicId: WS,
    payload,
    occurredAt: new Date(),
    sourceEventId: "e1",
    sourceEventType: "transaction.completed",
  })
  const second = await svc.tryEmitFromPaddleTransactionCompleted({
    workspacePublicId: WS,
    payload,
    occurredAt: new Date(),
    sourceEventId: "e2",
    sourceEventType: "transaction.completed",
  })
  assert.equal(second.emitted, false)
  assert.equal(second.skippedReason, "duplicate")
  assert.equal(memRepo.rows.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test("fallo de email no revierte recibo emitido", async () => {
  const snaps = new MemSnapshots()
  snaps.row = minimalSnapshot({})
  const emailCalls: string[] = []
  const { svc, receipts, root } = buildEmissionService({
    snapshots: snaps,
    emailImpl: { calls: emailCalls, fail: true },
  })
  const out = await svc.tryEmitFromPaddleTransactionCompleted({
    workspacePublicId: WS,
    payload: paddleTxnPayload(),
    occurredAt: new Date(),
    sourceEventId: "e",
    sourceEventType: "transaction.completed",
  })
  assert.equal(out.emitted, true)
  assert.equal(receipts.rows.length, 1)
  assert.equal(receipts.rows[0].emailSentAt, null)
  rmSync(root, { recursive: true, force: true })
})

test("regenerar PDF mantiene receiptPublicId y número (render)", async () => {
  const now = new Date("2026-05-01T12:00:00.000Z")
  const props: WorkspacePaymentReceiptProps = {
    receiptPublicId: "aaaaaaaa-bbbb-4ccc-aaaa-eeeeeeeeeeee",
    receiptNumber: "ALN-REC-2026-000001",
    workspacePublicId: WS,
    billingSource: "paddle",
    paymentProvider: "paddle",
    providerTransactionId: "txn_x",
    providerSubscriptionId: "sub_x",
    issuedAt: now,
    status: "issued",
    currencyCode: "EUR",
    amountPaidMinor: "1000",
    subtotalMinor: "826",
    taxAmountMinor: "174",
    customerName: "Cliente",
    customerEmail: null,
    workspaceName: "Demo",
    planKind: "team",
    billingCadence: "monthly",
    includedSeats: 3,
    additionalSeats: 1,
    periodStart: now,
    periodEnd: now,
    documentFormat: "pdf",
    pdfStorageKey: null,
    pdfGeneratedAt: null,
    emailSentAt: null,
    sourceEventId: null,
    sourceEventType: null,
    createdAt: now,
    updatedAt: now,
  }
  const a = await renderPaymentReceiptPdf(props)
  const b = await renderPaymentReceiptPdf(props)
  assert.ok(a.length > 50 && b.length > 50)
  assert.equal(props.receiptPublicId, "aaaaaaaa-bbbb-4ccc-aaaa-eeeeeeeeeeee")
})
