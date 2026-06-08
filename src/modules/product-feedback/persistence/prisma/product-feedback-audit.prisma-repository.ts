import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { ProductFeedbackAuditAppendInput, ProductFeedbackAuditRepository } from "../product-feedback-audit.repository.js"

export class ProductFeedbackAuditPrismaRepository implements ProductFeedbackAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: ProductFeedbackAuditAppendInput): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${input.workspacePublicId}`)
    await this.prisma.productFeedbackAuditEvent.create({
      data: {
        public_id: input.eventPublicId,
        submission_public_id: input.submissionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: input.workspacePublicId,
        kind: input.kind,
        actor_user_public_id: input.actorUserPublicId,
        actor_platform_user_id: input.actorPlatformUserId,
        summary: input.summary,
        payload_before: input.payloadBefore as Prisma.InputJsonValue | undefined,
        payload_after: input.payloadAfter as Prisma.InputJsonValue,
        occurred_at: input.occurredAt,
      },
    })
  }
}
