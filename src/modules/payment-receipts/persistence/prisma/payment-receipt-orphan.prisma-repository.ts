import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import type { PaymentReceiptOrphanEventDocProps } from "../schemas/payment-receipt-orphan-event.schema.js"
import type { PaymentReceiptOrphanEventRepository } from "../payment-receipt-orphan.repository.js"

export class PaymentReceiptOrphanPrismaRepository implements PaymentReceiptOrphanEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordOrInsertOnce(
    props: Omit<PaymentReceiptOrphanEventDocProps, never>,
  ): Promise<"inserted" | "already"> {
    const existing = await this.prisma.paymentReceiptOrphanEvent.findFirst({
      where: {
        payment_provider: props.paymentProvider,
        payload: {
          path: ["sourceEventId"],
          equals: props.sourceEventId,
        },
      },
      select: { id: true },
    })
    if (existing) return "already"

    await this.prisma.paymentReceiptOrphanEvent.create({
      data: {
        payment_provider: props.paymentProvider,
        provider_transaction_id: props.providerTransactionId ?? "",
        reason: props.note,
        payload: {
          sourceEventId: props.sourceEventId,
          sourceEventType: props.sourceEventType,
          receivedAt: props.receivedAt.toISOString(),
          payloadSnippet: props.payloadSnippet,
        } as Prisma.InputJsonValue,
      },
    })
    return "inserted"
  }
}
