import type { PaymentReceiptOrphanEventRepository } from "../persistence/payment-receipt-orphan.repository.js"
import type { PaymentReceiptEmissionService } from "./payment-receipt-emission.service.js"
import { extractPaddleTransactionId } from "./paddle-transaction-extract.js"

export class PaymentReceiptWebhookBridge {
  constructor(
    private readonly emission: PaymentReceiptEmissionService,
    private readonly orphans: PaymentReceiptOrphanEventRepository,
  ) {}

  async recordOrphanPaddleTransactionCompleted(params: {
    sourceEventId: string
    sourceEventType: string
    receivedAt: Date
    payload: Record<string, unknown>
  }): Promise<void> {
    const providerTransactionId = extractPaddleTransactionId(params.payload)
    await this.orphans.recordOrInsertOnce({
      sourceEventId: params.sourceEventId,
      sourceEventType: params.sourceEventType,
      paymentProvider: "paddle",
      providerTransactionId,
      receivedAt: params.receivedAt,
      note: "orphan_transaction_completed_no_workspace",
      payloadSnippet: {
        provider_transaction_id: providerTransactionId,
      },
    })
  }

  tryEmitFromPaddleTransactionCompleted(
    params: Parameters<PaymentReceiptEmissionService["tryEmitFromPaddleTransactionCompleted"]>[0],
  ): ReturnType<PaymentReceiptEmissionService["tryEmitFromPaddleTransactionCompleted"]> {
    return this.emission.tryEmitFromPaddleTransactionCompleted(params)
  }
}
