import type { PrismaClient } from "@prisma/client"
import type { PaddleWebhookProcessedRepository } from "../paddle-webhook-processed.repository.js"

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002"
}

export class PaddleWebhookProcessedPrismaRepository implements PaddleWebhookProcessedRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async tryClaimEvent(eventId: string, meta: { eventType: string; receivedAt: Date }): Promise<boolean> {
    try {
      await this.prisma.billingPaddleWebhookProcessedEvent.create({
        data: {
          event_id: eventId,
          event_type: meta.eventType,
          received_at: meta.receivedAt,
        },
      })
      return true
    } catch (err: unknown) {
      if (isUniqueViolation(err)) return false
      throw err
    }
  }
}
