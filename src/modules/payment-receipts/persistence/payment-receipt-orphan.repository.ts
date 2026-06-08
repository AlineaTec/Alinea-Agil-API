import type { PaymentReceiptOrphanEventDocProps } from "./schemas/payment-receipt-orphan-event.schema.js"

export interface PaymentReceiptOrphanEventRepository {
  recordOrInsertOnce(
    props: Omit<PaymentReceiptOrphanEventDocProps, never>,
  ): Promise<"inserted" | "already">
}
