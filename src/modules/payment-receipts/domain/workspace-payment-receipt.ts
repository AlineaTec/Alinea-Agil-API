import type { BillingSource } from "../../billing-seat-enforcement/domain/workspace-billing-status.js"

export const PAYMENT_RECEIPT_STATUSES = ["issued", "document_pending"] as const

export type PaymentReceiptStatus = (typeof PAYMENT_RECEIPT_STATUSES)[number]

export const PAYMENT_PROVIDERS = ["paddle"] as const

export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number]

export const DOCUMENT_FORMATS = ["pdf"] as const

export type PaymentReceiptDocumentFormat = (typeof DOCUMENT_FORMATS)[number]

export type WorkspacePaymentReceiptProps = {
  receiptPublicId: string
  receiptNumber: string
  workspacePublicId: string
  billingSource: BillingSource
  paymentProvider: PaymentProviderId
  providerTransactionId: string
  providerSubscriptionId: string | null
  issuedAt: Date
  status: PaymentReceiptStatus
  currencyCode: string
  /** Monto total cobrado en unidades menores (entero como string, alineado a Paddle). */
  amountPaidMinor: string
  subtotalMinor: string | null
  taxAmountMinor: string | null
  customerName: string
  customerEmail: string | null
  workspaceName: string
  planKind: string
  billingCadence: string | null
  includedSeats: number
  additionalSeats: number
  periodStart: Date | null
  periodEnd: Date | null
  documentFormat: PaymentReceiptDocumentFormat
  pdfStorageKey: string | null
  pdfGeneratedAt: Date | null
  emailSentAt: Date | null
  sourceEventId: string | null
  sourceEventType: string | null
  createdAt: Date
  updatedAt: Date
}
