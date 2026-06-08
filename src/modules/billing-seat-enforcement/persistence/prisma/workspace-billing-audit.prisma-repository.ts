import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { BillingAuditEventType } from "../../domain/workspace-billing-snapshot.js"
import type { WorkspaceBillingAuditRepository } from "../workspace-billing-audit.repository.js"

export class WorkspaceBillingAuditPrismaRepository implements WorkspaceBillingAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(
    workspacePublicId: string,
    eventType: BillingAuditEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${workspacePublicId}`)
    await this.prisma.billingWorkspaceAuditEvent.create({
      data: {
        workspace_id: workspaceId,
        workspace_public_id: workspacePublicId,
        event_type: eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    })
  }

  async listRecentByWorkspacePublicId(
    workspacePublicId: string,
    limit: number,
  ): Promise<Array<{ eventType: string; payload: Record<string, unknown>; createdAt: Date }>> {
    const safe = Math.min(200, Math.max(1, Math.floor(limit)))
    const rows = await this.prisma.billingWorkspaceAuditEvent.findMany({
      where: { workspace_public_id: workspacePublicId },
      orderBy: { created_at: "desc" },
      take: safe,
    })
    return rows.map((d) => ({
      eventType: d.event_type,
      payload: (d.payload ?? {}) as Record<string, unknown>,
      createdAt: d.created_at,
    }))
  }

  async findLatestAttentionEventsByWorkspaceIds(
    workspacePublicIds: string[],
    eventTypes: readonly string[],
  ): Promise<Map<string, { eventType: string; createdAt: Date }>> {
    const map = new Map<string, { eventType: string; createdAt: Date }>()
    if (workspacePublicIds.length === 0 || eventTypes.length === 0) return map
    const rows = await this.prisma.billingWorkspaceAuditEvent.findMany({
      where: {
        workspace_public_id: { in: workspacePublicIds },
        event_type: { in: [...eventTypes] },
      },
      orderBy: { created_at: "desc" },
    })
    for (const d of rows) {
      const wid = d.workspace_public_id
      if (!wid || map.has(wid)) continue
      map.set(wid, { eventType: d.event_type, createdAt: d.created_at })
    }
    return map
  }
}
