import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@prisma/client"
import type {
  AppendOutboundRecordInput,
  TransactionalEmailOutboundMessageLedger,
} from "../transactional-email-outbound-message.repository.js"

export class TransactionalEmailOutboundMessagePrismaRepository
  implements TransactionalEmailOutboundMessageLedger
{
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: AppendOutboundRecordInput): Promise<void> {
    await this.prisma.transactionalEmailOutboundMessage.create({
      data: {
        public_id: randomUUID(),
        template_key: input.templateKey,
        to_normalized: input.toNormalized,
        ok: input.ok,
        provider_message_id: input.providerMessageId,
        error_message: input.errorMessage,
        created_at: new Date(),
      },
    })
  }
}
