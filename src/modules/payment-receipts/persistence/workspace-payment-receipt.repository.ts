import type { BillingSource } from "../../billing-seat-enforcement/domain/workspace-billing-status.js"
import type { WorkspacePaymentReceiptProps } from "../domain/workspace-payment-receipt.js"

export type WorkspacePaymentReceiptListCursor = {
  issuedAt: Date
  receiptPublicId: string
}

export type WorkspacePaymentReceiptListFilter = {
  workspacePublicId: string
  limit: number
  cursor?: WorkspacePaymentReceiptListCursor | null
  issuedFrom?: Date | null
  issuedTo?: Date | null
}

export type PlatformPaymentReceiptListFilter = {
  limit: number
  cursor?: WorkspacePaymentReceiptListCursor | null
  workspacePublicId?: string | null
  billingSource?: BillingSource | null
  paymentProvider?: string | null
  issuedFrom?: Date | null
  issuedTo?: Date | null
}

export interface WorkspacePaymentReceiptRepository {
  insertNew(props: Omit<WorkspacePaymentReceiptProps, "createdAt" | "updatedAt">): Promise<WorkspacePaymentReceiptProps>
  findByProviderTransaction(
    paymentProvider: string,
    providerTransactionId: string,
  ): Promise<WorkspacePaymentReceiptProps | null>
  findByReceiptPublicId(receiptPublicId: string): Promise<WorkspacePaymentReceiptProps | null>
  findByWorkspace(
    filter: WorkspacePaymentReceiptListFilter,
  ): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: WorkspacePaymentReceiptListCursor | null }>
  findPlatformList(
    filter: PlatformPaymentReceiptListFilter,
  ): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: WorkspacePaymentReceiptListCursor | null }>
  updatePdfMetadata(
    receiptPublicId: string,
    patch: { pdfStorageKey: string; pdfGeneratedAt: Date; status: WorkspacePaymentReceiptProps["status"] },
  ): Promise<void>
  markEmailSent(receiptPublicId: string, sentAt: Date): Promise<void>
}
