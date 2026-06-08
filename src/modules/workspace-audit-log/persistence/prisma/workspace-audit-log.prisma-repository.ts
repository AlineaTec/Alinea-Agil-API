import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspaceAuditLogAppendInput } from "../../domain/workspace-audit-log-entry.js"
import type {
  WorkspaceAuditLogListForProjectInput,
  WorkspaceAuditLogListRow,
} from "../../domain/workspace-audit-log-list-row.js"
import type {
  WorkspaceAuditLogCountForProjectUserInput,
  WorkspaceAuditLogRepository,
} from "../workspace-audit-log.repository.js"

function rowToListRow(row: {
  public_id: string
  workspace_public_id: string
  category: string
  action: string
  occurred_at: Date
  resource_project_public_id: string
  resource_backlog_item_public_id: string | null
  previous_value: Prisma.JsonValue | null
  next_value: Prisma.JsonValue
}): WorkspaceAuditLogListRow {
  return {
    auditEventPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    category: row.category as WorkspaceAuditLogListRow["category"],
    action: row.action,
    occurredAt: row.occurred_at,
    resourceProjectPublicId: row.resource_project_public_id,
    resourceBacklogItemPublicId: row.resource_backlog_item_public_id,
    previousValue: row.previous_value,
    nextValue: row.next_value,
  }
}

export class WorkspaceAuditLogPrismaRepository implements WorkspaceAuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: WorkspaceAuditLogAppendInput): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${input.workspacePublicId}`)
    await this.prisma.workspaceAuditEvent.create({
      data: {
        public_id: randomUUID(),
        workspace_id: workspaceId,
        workspace_public_id: input.workspacePublicId,
        category: input.category,
        action: input.action,
        actor_user_public_id: input.actorUserPublicId,
        occurred_at: input.occurredAt,
        resource_project_public_id: input.resource.projectPublicId,
        resource_backlog_item_public_id: input.resource.backlogItemPublicId,
        previous_value: input.previousValue as Prisma.InputJsonValue,
        next_value: input.nextValue as Prisma.InputJsonValue,
      },
    })
  }

  async listForProject(input: WorkspaceAuditLogListForProjectInput): Promise<WorkspaceAuditLogListRow[]> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    if (!workspaceId) return []
    const where: Prisma.WorkspaceAuditEventWhereInput = {
      workspace_id: workspaceId,
      resource_project_public_id: input.projectPublicId,
    }
    if (input.categories && input.categories.length > 0) {
      where.category = { in: input.categories }
    }
    if (input.actions && input.actions.length > 0) {
      where.action = { in: input.actions }
    }
    if (input.occurredAtFrom || input.occurredAtTo) {
      const occurred_at: Prisma.DateTimeFilter = {}
      if (input.occurredAtFrom) occurred_at.gte = input.occurredAtFrom
      if (input.occurredAtTo) occurred_at.lte = input.occurredAtTo
      where.occurred_at = occurred_at
    }
    const rows = await this.prisma.workspaceAuditEvent.findMany({
      where,
      orderBy: { occurred_at: "asc" },
    })
    return rows.map(rowToListRow)
  }

  async countForProjectUserInWindow(input: WorkspaceAuditLogCountForProjectUserInput): Promise<number> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    if (!workspaceId) return 0
    return this.prisma.workspaceAuditEvent.count({
      where: {
        workspace_id: workspaceId,
        resource_project_public_id: input.projectPublicId,
        actor_user_public_id: input.actorUserPublicId,
        category: { in: input.categories },
        occurred_at: { gte: input.occurredAtFrom, lte: input.occurredAtTo },
      },
    })
  }
}
