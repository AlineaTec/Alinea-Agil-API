import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import type { WorkControlsAuditAppendInput, WorkControlsAuditRepository } from "../work-controls-audit.repository.js"

export class WorkControlsAuditPrismaRepository implements WorkControlsAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: WorkControlsAuditAppendInput): Promise<void> {
    await this.prisma.workControlsAuditEvent.create({
      data: {
        public_id: randomUUID(),
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        event: input.event,
        actor_user_public_id: input.actorUserPublicId,
        occurred_at: input.occurredAt,
        details: input.details as Prisma.InputJsonValue,
      },
    })
  }
}
