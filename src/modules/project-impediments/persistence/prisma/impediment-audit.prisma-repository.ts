import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { resolveProjectId } from "../../../../infrastructure/postgres/project-scope.js"
import type { ImpedimentAuditAppendInput, ImpedimentAuditRepository } from "../impediment-audit.repository.js"

export class ImpedimentAuditPrismaRepository implements ImpedimentAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: ImpedimentAuditAppendInput): Promise<void> {
    const projectId = await resolveProjectId(
      this.prisma,
      input.workspacePublicId,
      input.projectPublicId,
    )
    if (!projectId) throw new Error("impediment_audit_project_not_found")
    await this.prisma.projectImpedimentAuditEvent.create({
      data: {
        public_id: randomUUID(),
        workspace_public_id: input.workspacePublicId,
        project_id: projectId,
        project_public_id: input.projectPublicId,
        impediment_public_id: input.impedimentPublicId,
        action: input.action,
        actor_user_public_id: input.actorUserPublicId,
        occurred_at: input.occurredAt,
        payload_before: input.payloadBefore as Prisma.InputJsonValue,
        payload_after: input.payloadAfter as Prisma.InputJsonValue,
      },
    })
  }
}
