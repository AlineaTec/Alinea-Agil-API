import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  ProductIdeaFeedbackEntryAuditAppendInput,
  ProductIdeaFeedbackEntryAuditRepository,
} from "../product-idea-feedback-audit.repository.js"

export class ProductIdeaFeedbackAuditPrismaRepository implements ProductIdeaFeedbackEntryAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(event: ProductIdeaFeedbackEntryAuditAppendInput): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, event.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${event.workspacePublicId}`)
    await this.prisma.productIdeaFeedbackAuditEvent.create({
      data: {
        public_id: event.eventPublicId ?? randomUUID(),
        feedback_public_id: event.feedbackPublicId,
        workspace_id: workspaceId,
        workspace_public_id: event.workspacePublicId,
        kind: event.kind,
        actor_user_public_id: event.actorUserPublicId,
        actor_platform_user_id: event.actorPlatformUserId,
        summary: event.summary,
        payload_before: event.payloadBefore as Prisma.InputJsonValue | undefined,
        payload_after: event.payloadAfter as Prisma.InputJsonValue,
        occurred_at: event.occurredAt ?? new Date(),
      },
    })
  }
}
