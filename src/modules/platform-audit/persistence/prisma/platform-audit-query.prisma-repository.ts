import type { Prisma, PrismaClient } from "@prisma/client"
import type { PlatformAuditAction } from "../../../platform-users/domain/platform-audit-action.js"
import {
  platformAuditActionsExcludedFromLicensingCategory,
  platformAuditActionsForCategory,
} from "../../domain/platform-audit-category.js"
import type {
  PlatformAuditListFilters,
  PlatformAuditQueryRepository,
  PlatformAuditEventRow,
} from "../platform-audit-query.repository.js"

function rowToEvent(row: {
  public_id: string
  occurred_at: Date
  actor_platform_user_id: string
  actor_role: string
  action: string
  target_platform_user_id: string | null
  target_platform_tenant_id: string | null
  workspace_public_id: string | null
  summary: string
  payload_before: Prisma.JsonValue | null
  payload_after: Prisma.JsonValue | null
}): PlatformAuditEventRow {
  return {
    platformAuditEventId: row.public_id,
    occurredAt: row.occurred_at,
    actorPlatformUserId: row.actor_platform_user_id,
    actorRole: row.actor_role as PlatformAuditEventRow["actorRole"],
    action: row.action as PlatformAuditAction,
    targetPlatformUserId: row.target_platform_user_id,
    targetPlatformTenantId: row.target_platform_tenant_id,
    workspacePublicId: row.workspace_public_id,
    summary: row.summary,
    payloadBefore: row.payload_before,
    payloadAfter: row.payload_after,
  }
}

function buildWhere(filters: PlatformAuditListFilters): Prisma.PlatformAuditEventWhereInput {
  const where: Prisma.PlatformAuditEventWhereInput = {
    occurred_at: { gte: filters.fromInclusive, lte: filters.toInclusive },
  }
  if (filters.platformTenantId) {
    where.target_platform_tenant_id = filters.platformTenantId
  }
  if (filters.actorPlatformUserId) {
    where.actor_platform_user_id = filters.actorPlatformUserId
  }
  if (filters.action) {
    where.action = filters.action
  } else if (filters.category) {
    if (filters.category === "platform_licensing") {
      where.action = { notIn: [...platformAuditActionsExcludedFromLicensingCategory()] }
    } else {
      where.action = { in: [...platformAuditActionsForCategory(filters.category)] }
    }
  }
  if (filters.workspacePublicId) {
    where.OR = [
      { workspace_public_id: filters.workspacePublicId },
      {
        payload_after: {
          path: ["workspacePublicId"],
          equals: filters.workspacePublicId,
        },
      },
    ]
  }
  return where
}

export class PlatformAuditQueryPrismaRepository implements PlatformAuditQueryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    filters: PlatformAuditListFilters,
    opts: { limit: number; offset: number },
  ): Promise<PlatformAuditEventRow[]> {
    const rows = await this.prisma.platformAuditEvent.findMany({
      where: buildWhere(filters),
      orderBy: { occurred_at: "desc" },
      skip: opts.offset,
      take: opts.limit,
    })
    return rows.map(rowToEvent)
  }

  async count(filters: PlatformAuditListFilters): Promise<number> {
    return this.prisma.platformAuditEvent.count({ where: buildWhere(filters) })
  }

  async findById(platformAuditEventId: string): Promise<PlatformAuditEventRow | null> {
    const row = await this.prisma.platformAuditEvent.findUnique({
      where: { public_id: platformAuditEventId },
    })
    return row ? rowToEvent(row) : null
  }
}
