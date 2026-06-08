import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { assertPlatformSessionCanReadTenants } from "../../platform-tenants/policies/platform-tenants.policy.js"
import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type { WorkspacePaymentReceiptProps } from "../domain/workspace-payment-receipt.js"
import {
  PaymentReceiptDocumentUnavailableError,
  PaymentReceiptNotFoundError,
  PaymentReceiptWorkspaceMismatchError,
} from "../domain/payment-receipt.errors.js"
import { renderPaymentReceiptPdf } from "../rendering/payment-receipt-pdf.renderer.js"
import type {
  PlatformPaymentReceiptListFilter,
  WorkspacePaymentReceiptListFilter,
} from "../persistence/workspace-payment-receipt.repository.js"
import type { WorkspacePaymentReceiptRepository } from "../persistence/workspace-payment-receipt.repository.js"
import type { PaymentReceiptLocalFileStorage } from "./payment-receipt-local.storage.js"

export type WorkspacePaymentReceiptClientItem = {
  receiptPublicId: string
  receiptNumber: string
  issuedAt: string
  amountPaidMinor: string
  currencyCode: string
  status: WorkspacePaymentReceiptProps["status"]
  customerFacingPaymentReference: string
  downloadAvailable: boolean
}

export type WorkspacePaymentReceiptClientDetail = WorkspacePaymentReceiptClientItem & {
  workspacePublicId: string
  planKind: string
  billingCadence: string | null
  periodStart: string | null
  periodEnd: string | null
}

export type PlatformPaymentReceiptDetail = WorkspacePaymentReceiptClientDetail & {
  billingSource: WorkspacePaymentReceiptProps["billingSource"]
  paymentProvider: string
  providerTransactionId: string
  providerSubscriptionId: string | null
  customerName: string
  customerEmail: string | null
  pdfGeneratedAt: string | null
  emailSentAt: string | null
  sourceEventId: string | null
  sourceEventType: string | null
}

function toClientItem(r: WorkspacePaymentReceiptProps): WorkspacePaymentReceiptClientItem {
  return {
    receiptPublicId: r.receiptPublicId,
    receiptNumber: r.receiptNumber,
    issuedAt: r.issuedAt.toISOString(),
    amountPaidMinor: r.amountPaidMinor,
    currencyCode: r.currencyCode,
    status: r.status,
    customerFacingPaymentReference: r.receiptNumber,
    downloadAvailable: r.status === "issued" || r.status === "document_pending",
  }
}

export class PaymentReceiptAccessService {
  constructor(
    private readonly receipts: WorkspacePaymentReceiptRepository,
    private readonly storage: PaymentReceiptLocalFileStorage,
    private readonly billing: WorkspaceBillingStateService,
  ) {}

  assertPlatformCanRead(session: PlatformSessionContext): void {
    assertPlatformSessionCanReadTenants(session)
  }

  async listForWorkspace(filter: WorkspacePaymentReceiptListFilter): Promise<{
    items: WorkspacePaymentReceiptClientItem[]
    nextCursor: string | null
  }> {
    const { items, nextCursor } = await this.receipts.findByWorkspace(filter)
    return {
      items: items.map(toClientItem),
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    }
  }

  async listForPlatform(filter: PlatformPaymentReceiptListFilter): Promise<{
    items: PlatformPaymentReceiptDetail[]
    nextCursor: string | null
  }> {
    const { items, nextCursor } = await this.receipts.findPlatformList(filter)
    return {
      items: items.map(toPlatformDetail),
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    }
  }

  async getForWorkspace(
    workspacePublicId: string,
    receiptPublicId: string,
  ): Promise<WorkspacePaymentReceiptClientDetail> {
    const row = await this.receipts.findByReceiptPublicId(receiptPublicId)
    if (!row) throw new PaymentReceiptNotFoundError()
    if (row.workspacePublicId !== workspacePublicId) throw new PaymentReceiptWorkspaceMismatchError()
    return {
      ...toClientItem(row),
      workspacePublicId: row.workspacePublicId,
      planKind: row.planKind,
      billingCadence: row.billingCadence,
      periodStart: row.periodStart?.toISOString() ?? null,
      periodEnd: row.periodEnd?.toISOString() ?? null,
    }
  }

  async getForPlatform(receiptPublicId: string): Promise<PlatformPaymentReceiptDetail> {
    const row = await this.receipts.findByReceiptPublicId(receiptPublicId)
    if (!row) throw new PaymentReceiptNotFoundError()
    return toPlatformDetail(row)
  }

  async streamPdfForWorkspace(
    workspacePublicId: string,
    receiptPublicId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const row = await this.receipts.findByReceiptPublicId(receiptPublicId)
    if (!row) throw new PaymentReceiptNotFoundError()
    if (row.workspacePublicId !== workspacePublicId) throw new PaymentReceiptWorkspaceMismatchError()
    const buf = await this.ensurePdfBuffer(row, { allowRegenerate: true })
    return { filename: `${row.receiptNumber}.pdf`, buffer: buf }
  }

  async streamPdfForPlatform(receiptPublicId: string): Promise<{ filename: string; buffer: Buffer }> {
    const row = await this.receipts.findByReceiptPublicId(receiptPublicId)
    if (!row) throw new PaymentReceiptNotFoundError()
    const buf = await this.ensurePdfBuffer(row, { allowRegenerate: true })
    return { filename: `${row.receiptNumber}.pdf`, buffer: buf }
  }

  private async ensurePdfBuffer(
    row: WorkspacePaymentReceiptProps,
    opts: { allowRegenerate: boolean },
  ): Promise<Buffer> {
    if (row.pdfStorageKey) {
      const existing = await this.storage.readBuffer(row.pdfStorageKey)
      if (existing) return existing
    }
    if (!opts.allowRegenerate) {
      throw new PaymentReceiptDocumentUnavailableError()
    }
    const pdf = await renderPaymentReceiptPdf(row)
    const key = `receiptpdfs/${row.receiptPublicId}.pdf`
    await this.storage.writeBuffer(key, pdf)
    await this.receipts.updatePdfMetadata(row.receiptPublicId, {
      pdfStorageKey: key,
      pdfGeneratedAt: new Date(),
      status: "issued",
    })
    await this.billing.appendBillingAuditEvent(row.workspacePublicId, "payment_receipt_pdf_regenerated", {
      receipt_public_id: row.receiptPublicId,
      receipt_number: row.receiptNumber,
    })
    return pdf
  }
}

function toPlatformDetail(row: WorkspacePaymentReceiptProps): PlatformPaymentReceiptDetail {
  return {
    ...toClientItem(row),
    workspacePublicId: row.workspacePublicId,
    planKind: row.planKind,
    billingCadence: row.billingCadence,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    billingSource: row.billingSource,
    paymentProvider: row.paymentProvider,
    providerTransactionId: row.providerTransactionId,
    providerSubscriptionId: row.providerSubscriptionId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    pdfGeneratedAt: row.pdfGeneratedAt?.toISOString() ?? null,
    emailSentAt: row.emailSentAt?.toISOString() ?? null,
    sourceEventId: row.sourceEventId,
    sourceEventType: row.sourceEventType,
  }
}

export function encodeCursor(c: { issuedAt: Date; receiptPublicId: string }): string {
  return Buffer.from(
    JSON.stringify({ ia: c.issuedAt.toISOString(), r: c.receiptPublicId }),
    "utf-8",
  ).toString("base64url")
}

export function decodeCursor(raw: string | undefined): { issuedAt: Date; receiptPublicId: string } | null {
  if (!raw) return null
  try {
    const j = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8")) as { ia?: string; r?: string }
    if (!j.ia || !j.r) return null
    const d = new Date(j.ia)
    if (!Number.isFinite(d.getTime())) return null
    return { issuedAt: d, receiptPublicId: j.r }
  } catch {
    return null
  }
}
