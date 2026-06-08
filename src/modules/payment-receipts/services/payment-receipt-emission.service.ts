import { randomUUID } from "node:crypto"

import { workspaceBillingHubUrl } from "../../../config/workspace-app-public-url.js"
import type { WorkspaceBillingSnapshotRepository } from "../../billing-seat-enforcement/persistence/workspace-billing-snapshot.repository.js"
import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import { extractSubscriptionId } from "../../billing-seat-enforcement/services/paddle-webhook-mapper.js"
import type { TransactionalEmailService } from "../../transactional-email/services/transactional-email.service.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { WorkspaceIdentityRepository } from "../../workspace-users/persistence/workspace-identity.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspacePaymentReceiptProps } from "../domain/workspace-payment-receipt.js"
import { PaymentReceiptDuplicateEmissionError } from "../domain/payment-receipt.errors.js"
import { renderPaymentReceiptPdf } from "../rendering/payment-receipt-pdf.renderer.js"
import type { PaymentReceiptYearSequenceRepository } from "../persistence/payment-receipt-year-sequence.repository.js"
import type { WorkspacePaymentReceiptRepository } from "../persistence/workspace-payment-receipt.repository.js"
import type { PaymentReceiptLocalFileStorage } from "./payment-receipt-local.storage.js"
import {
  extractBillingCadenceFromTransactionItems,
  extractPaddleCustomerDisplay,
  extractPaddleTransactionId,
  extractPaddleTransactionMoney,
} from "./paddle-transaction-extract.js"
import { renderWorkspacePaymentReceipt } from "../../transactional-email/templates/workspace-payment-receipt.template.js"

function firstAdminOperatorEmail(members: WorkspaceMemberState[]): string | null {
  const emails = new Set<string>()
  for (const m of members) {
    if (m.status !== "active") continue
    const r = m.workspaceRoleAdministrative
    if (r === "admin" || r === "operator") {
      emails.add(m.emailNormalized.trim().toLowerCase())
    }
  }
  const sorted = [...emails].sort()
  return sorted[0] ?? null
}

function firstAdminOperatorName(members: WorkspaceMemberState[]): string | null {
  for (const m of members) {
    if (m.status !== "active") continue
    const r = m.workspaceRoleAdministrative
    if (r === "admin" || r === "operator") {
      const n = m.fullName?.trim()
      if (n) return n
    }
  }
  return null
}

export class PaymentReceiptEmissionService {
  constructor(
    private readonly receipts: WorkspacePaymentReceiptRepository,
    private readonly sequences: PaymentReceiptYearSequenceRepository,
    private readonly snapshots: WorkspaceBillingSnapshotRepository,
    private readonly billing: WorkspaceBillingStateService,
    private readonly identity: WorkspaceIdentityRepository,
    private readonly members: WorkspaceMemberRepository,
    private readonly storage: PaymentReceiptLocalFileStorage,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  async tryEmitFromPaddleTransactionCompleted(params: {
    workspacePublicId: string
    payload: Record<string, unknown>
    occurredAt: Date
    sourceEventId: string
    sourceEventType: string
  }): Promise<{ emitted: boolean; receiptPublicId?: string; skippedReason?: string }> {
    const providerTransactionId = extractPaddleTransactionId(params.payload)
    if (!providerTransactionId) {
      await this.billing.appendBillingAuditEvent(params.workspacePublicId, "payment_receipt_skipped", {
        reason: "missing_provider_transaction_id",
        source_event_id: params.sourceEventId,
      })
      return { emitted: false, skippedReason: "missing_provider_transaction_id" }
    }

    const duplicateExisting = await this.receipts.findByProviderTransaction("paddle", providerTransactionId)
    if (duplicateExisting) {
      return { emitted: false, receiptPublicId: duplicateExisting.receiptPublicId, skippedReason: "duplicate" }
    }

    const snap = await this.snapshots.findByWorkspacePublicId(params.workspacePublicId)
    if (!snap) {
      await this.billing.appendBillingAuditEvent(params.workspacePublicId, "payment_receipt_skipped", {
        reason: "snapshot_missing",
        provider_transaction_id: providerTransactionId,
      })
      return { emitted: false, skippedReason: "snapshot_missing" }
    }

    if (snap.billingSource !== "paddle") {
      await this.billing.appendBillingAuditEvent(params.workspacePublicId, "payment_receipt_skipped", {
        reason: "manual_billing_no_auto_receipt",
        provider_transaction_id: providerTransactionId,
      })
      return { emitted: false, skippedReason: "manual_billing" }
    }

    const money = extractPaddleTransactionMoney(params.payload)
    if (!money) {
      await this.billing.appendBillingAuditEvent(params.workspacePublicId, "payment_receipt_skipped", {
        reason: "paddle_amounts_unparsed",
        provider_transaction_id: providerTransactionId,
      })
      return { emitted: false, skippedReason: "paddle_amounts_unparsed" }
    }

    const year = params.occurredAt.getUTCFullYear()
    const seq = await this.sequences.nextForYear(year)
    const receiptNumber = `ALN-REC-${year}-${String(seq).padStart(6, "0")}`
    const receiptPublicId = randomUUID()

    const providerSubscriptionId = extractSubscriptionId(params.payload, "transaction.completed")
    const paddleCustomer = extractPaddleCustomerDisplay(params.payload)
    const billingCadence = extractBillingCadenceFromTransactionItems(params.payload)

    const workspaceIdentity = await this.identity.findByWorkspacePublicId(params.workspacePublicId)
    const workspaceName = workspaceIdentity?.displayName?.trim() || params.workspacePublicId.slice(0, 8)
    const memberRows = await this.members.listByWorkspacePublicId(params.workspacePublicId)
    const billingRecipient = firstAdminOperatorEmail(memberRows)
    const fallbackName = firstAdminOperatorName(memberRows)
    const customerName = paddleCustomer.name !== "Cliente" ? paddleCustomer.name : fallbackName ?? paddleCustomer.name
    const customerEmail = paddleCustomer.email ?? billingRecipient

    const planKind = snap.planKey || "—"
    const includedSeats = snap.includedSeats
    const additionalSeats = snap.additionalPaidSeats

    const rowBase: Omit<WorkspacePaymentReceiptProps, "createdAt" | "updatedAt"> = {
      receiptPublicId,
      receiptNumber,
      workspacePublicId: params.workspacePublicId,
      billingSource: snap.billingSource,
      paymentProvider: "paddle",
      providerTransactionId,
      providerSubscriptionId,
      issuedAt: params.occurredAt,
      status: "document_pending",
      currencyCode: money.currencyCode,
      amountPaidMinor: money.amountPaidMinor,
      subtotalMinor: money.subtotalMinor,
      taxAmountMinor: money.taxAmountMinor,
      customerName,
      customerEmail,
      workspaceName,
      planKind,
      billingCadence,
      includedSeats,
      additionalSeats,
      periodStart: snap.currentPeriodStartsAt,
      periodEnd: snap.currentPeriodEndsAt,
      documentFormat: "pdf",
      pdfStorageKey: null,
      pdfGeneratedAt: null,
      emailSentAt: null,
      sourceEventId: params.sourceEventId,
      sourceEventType: params.sourceEventType,
    }

    let inserted: WorkspacePaymentReceiptProps
    try {
      inserted = await this.receipts.insertNew(rowBase)
    } catch (e) {
      if (e instanceof PaymentReceiptDuplicateEmissionError) {
        const row = await this.receipts.findByProviderTransaction("paddle", providerTransactionId)
        return { emitted: false, receiptPublicId: row?.receiptPublicId, skippedReason: "duplicate" }
      }
      throw e
    }

    await this.billing.appendBillingAuditEvent(params.workspacePublicId, "payment_receipt_emitted", {
      receipt_public_id: inserted.receiptPublicId,
      receipt_number: inserted.receiptNumber,
      provider_transaction_id: providerTransactionId,
      source_event_id: params.sourceEventId,
    })

    try {
      const pdfBuf = await renderPaymentReceiptPdf(inserted)
      const pdfStorageKey = `receiptpdfs/${inserted.receiptPublicId}.pdf`
      await this.storage.writeBuffer(pdfStorageKey, pdfBuf)
      await this.receipts.updatePdfMetadata(inserted.receiptPublicId, {
        pdfStorageKey,
        pdfGeneratedAt: new Date(),
        status: "issued",
      })
    } catch (err) {
      console.warn("[payment-receipt] pdf generation failed (receipt row persisted)", {
        receiptPublicId: inserted.receiptPublicId,
        err,
      })
    }

    const refreshed = (await this.receipts.findByReceiptPublicId(inserted.receiptPublicId)) ?? inserted

    await this.trySendReceiptEmail(refreshed, billingRecipient)

    return { emitted: true, receiptPublicId: inserted.receiptPublicId }
  }

  private async trySendReceiptEmail(
    receipt: WorkspacePaymentReceiptProps,
    billingRecipient: string | null,
  ): Promise<void> {
    const to = billingRecipient
    if (!to) {
      await this.billing.appendBillingAuditEvent(receipt.workspacePublicId, "payment_receipt_email_failed", {
        receipt_public_id: receipt.receiptPublicId,
        reason: "no_billing_recipient",
      })
      return
    }

    const hub = workspaceBillingHubUrl(receipt.workspacePublicId)
    const rendered = renderWorkspacePaymentReceipt({
      receiptNumber: receipt.receiptNumber,
      workspaceDisplayName: receipt.workspaceName,
      amountPaidMinor: receipt.amountPaidMinor,
      currencyCode: receipt.currencyCode,
      billingHubUrl: hub,
    })

    try {
      await this.transactionalEmail.sendWorkspacePaymentReceiptEmail({ toEmail: to, rendered })
      await this.receipts.markEmailSent(receipt.receiptPublicId, new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.billing.appendBillingAuditEvent(receipt.workspacePublicId, "payment_receipt_email_failed", {
        receipt_public_id: receipt.receiptPublicId,
        reason: "transport_or_dispatch",
        detail: msg,
      })
    }
  }
}
