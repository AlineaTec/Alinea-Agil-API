export type PaymentReceiptOrphanEventDocProps = {
  sourceEventId: string
  sourceEventType: string
  paymentProvider: string
  providerTransactionId: string | null
  receivedAt: Date
  note: string
  payloadSnippet: Record<string, unknown>
}
