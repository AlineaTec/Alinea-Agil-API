import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { BillingNotificationKind } from "../../domain/billing-notification-kind.js"
import type { BillingNotificationSentRepository } from "../billing-notification-sent.repository.js"

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002"
}

export class BillingNotificationSentPrismaRepository implements BillingNotificationSentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async tryClaim(workspacePublicId: string, kind: BillingNotificationKind, dedupeKey: string): Promise<boolean> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${workspacePublicId}`)
    try {
      await this.prisma.billingNotificationSend.create({
        data: {
          workspace_id: workspaceId,
          workspace_public_id: workspacePublicId,
          kind,
          dedupe_key: dedupeKey,
          sent_at: new Date(),
        },
      })
      return true
    } catch (err: unknown) {
      if (isUniqueViolation(err)) return false
      throw err
    }
  }

  async listRecentByWorkspacePublicId(
    workspacePublicId: string,
    limit: number,
  ): Promise<Array<{ kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>> {
    const safe = Math.min(200, Math.max(1, Math.floor(limit)))
    const rows = await this.prisma.billingNotificationSend.findMany({
      where: { workspace_public_id: workspacePublicId },
      orderBy: { sent_at: "desc" },
      take: safe,
    })
    return rows.map((r) => ({
      kind: r.kind as BillingNotificationKind,
      dedupeKey: r.dedupe_key,
      sentAt: r.sent_at,
    }))
  }

  async findLatestPerWorkspaceIds(
    workspacePublicIds: string[],
  ): Promise<Map<string, { kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>> {
    const map = new Map<string, { kind: BillingNotificationKind; dedupeKey: string; sentAt: Date }>()
    if (workspacePublicIds.length === 0) return map
    const rows = await this.prisma.billingNotificationSend.findMany({
      where: { workspace_public_id: { in: workspacePublicIds } },
      orderBy: { sent_at: "desc" },
    })
    for (const r of rows) {
      const wid = r.workspace_public_id
      if (!wid || map.has(wid)) continue
      map.set(wid, {
        kind: r.kind as BillingNotificationKind,
        dedupeKey: r.dedupe_key,
        sentAt: r.sent_at,
      })
    }
    return map
  }
}
