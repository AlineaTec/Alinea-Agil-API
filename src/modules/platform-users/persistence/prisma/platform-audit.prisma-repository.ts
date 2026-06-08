import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import type { PlatformAuditRepository, PlatformAuditEventRecord } from "../platform-audit.repository.js"

export class PlatformAuditPrismaRepository implements PlatformAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(
    record: Omit<PlatformAuditEventRecord, "platformAuditEventId" | "occurredAt">,
  ): Promise<void> {
    await this.prisma.platformAuditEvent.create({
      data: {
        public_id: randomUUID(),
        occurred_at: new Date(),
        actor_platform_user_id: record.actorPlatformUserId,
        actor_role: record.actorRole,
        action: record.action,
        target_platform_user_id: record.targetPlatformUserId,
        target_platform_tenant_id: record.targetPlatformTenantId,
        workspace_public_id: record.workspacePublicId,
        summary: record.summary,
        payload_before: record.payloadBefore as Prisma.InputJsonValue | undefined,
        payload_after: record.payloadAfter as Prisma.InputJsonValue,
      },
    })
  }
}
