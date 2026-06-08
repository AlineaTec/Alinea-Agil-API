import type { PrismaClient } from "@prisma/client"
import type { PaymentReceiptYearSequenceRepository } from "../payment-receipt-year-sequence.repository.js"

export class PaymentReceiptYearSequencePrismaRepository implements PaymentReceiptYearSequenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async nextForYear(year: number): Promise<number> {
    const row = await this.prisma.paymentReceiptYearSequence.upsert({
      where: { year },
      create: { year, last: 1 },
      update: { last: { increment: 1 } },
    })
    return row.last
  }
}
