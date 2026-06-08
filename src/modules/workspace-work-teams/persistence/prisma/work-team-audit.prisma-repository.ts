import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  WorkTeamAuditAppendInput,
  WorkTeamAuditListRow,
  WorkTeamAuditRepository,
} from "../work-team-audit.repository.js"

function rowToListRow(row: {
  public_id: string
  team_public_id: string
  action: string
  actor_user_public_id: string
  occurred_at: Date
  payload_before: Prisma.JsonValue | null
  payload_after: Prisma.JsonValue | null
}): WorkTeamAuditListRow {
  return {
    auditEventPublicId: row.public_id,
    teamPublicId: row.team_public_id,
    action: row.action as WorkTeamAuditListRow["action"],
    actorUserPublicId: row.actor_user_public_id,
    occurredAt: row.occurred_at,
    payloadBefore: row.payload_before,
    payloadAfter: row.payload_after,
  }
}

export class WorkTeamAuditPrismaRepository implements WorkTeamAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: WorkTeamAuditAppendInput): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${input.workspacePublicId}`)
    await this.prisma.workTeamAuditEvent.create({
      data: {
        public_id: randomUUID(),
        workspace_id: workspaceId,
        workspace_public_id: input.workspacePublicId,
        team_public_id: input.teamPublicId,
        action: input.action,
        actor_user_public_id: input.actorUserPublicId,
        occurred_at: input.occurredAt,
        payload_before: input.payloadBefore as Prisma.InputJsonValue,
        payload_after: input.payloadAfter as Prisma.InputJsonValue,
      },
    })
  }

  async listByTeam(
    workspacePublicId: string,
    teamPublicId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: WorkTeamAuditListRow[]; totalCount: number }> {
    const where = { workspace_public_id: workspacePublicId, team_public_id: teamPublicId }
    const [totalCount, rows] = await Promise.all([
      this.prisma.workTeamAuditEvent.count({ where }),
      this.prisma.workTeamAuditEvent.findMany({
        where,
        orderBy: { occurred_at: "desc" },
        skip: options.offset,
        take: options.limit,
      }),
    ])
    return { totalCount, items: rows.map(rowToListRow) }
  }
}
