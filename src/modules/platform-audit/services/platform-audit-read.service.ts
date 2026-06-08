import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { platformAuditCategoryForAction } from "../domain/platform-audit-category.js"
import {
  redactPayloadPair,
  redactPlatformUserId,
  redactSummary,
  redactTenantOrWorkspaceId,
  redactionLevelForRole,
} from "../domain/platform-audit-redaction.js"
import {
  PlatformAuditReadNotFoundError,
  PlatformAuditReadValidationError,
} from "../domain/platform-audit-read.errors.js"
import { platformAuditSensitivityForAction } from "../domain/platform-audit-sensitivity.js"
import { assertPlatformSessionCanReadAudit } from "../policies/platform-audit-read.policy.js"
import type {
  PlatformAuditListFilters,
  PlatformAuditQueryRepository,
  PlatformAuditEventRow,
} from "../persistence/platform-audit-query.repository.js"

/** Retención v1: 12 meses (documentado en README; ventana por defecto en listados). */
export const PLATFORM_AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

export const PLATFORM_AUDIT_EXPORT_MAX_ROWS = 5000

export type PlatformAuditEventPublic = {
  platformAuditEventId: string
  timestamp: string
  category: ReturnType<typeof platformAuditCategoryForAction>
  action: string
  actorPlatformUserId: string
  actorRole: PlatformAuditEventRow["actorRole"]
  targetPlatformUserId: string | null
  targetPlatformTenantId: string | null
  workspacePublicId: string | null
  summary: string
  changedFields: string[] | null
  before: unknown | null
  after: unknown | null
  sensitivityTier: ReturnType<typeof platformAuditSensitivityForAction>
}

export class PlatformAuditReadService {
  constructor(private readonly query: PlatformAuditQueryRepository) {}

  private resolveWorkspacePublicId(row: PlatformAuditEventRow): string | null {
    if (row.workspacePublicId) return row.workspacePublicId
    const after = row.payloadAfter
    if (after && typeof after === "object" && !Array.isArray(after) && "workspacePublicId" in after) {
      const w = (after as Record<string, unknown>).workspacePublicId
      if (typeof w === "string") return w
    }
    return null
  }

  private toPublic(session: PlatformSessionContext, row: PlatformAuditEventRow): PlatformAuditEventPublic {
    const level = redactionLevelForRole(session.role)
    const tier = platformAuditSensitivityForAction(row.action)
    const { before, after, changedFields } = redactPayloadPair(
      row.payloadBefore,
      row.payloadAfter,
      level,
      tier,
    )
    const ws = this.resolveWorkspacePublicId(row)
    return {
      platformAuditEventId: row.platformAuditEventId,
      timestamp: row.occurredAt.toISOString(),
      category: platformAuditCategoryForAction(row.action),
      action: row.action,
      actorPlatformUserId: redactPlatformUserId(row.actorPlatformUserId, level) ?? "",
      actorRole: row.actorRole,
      targetPlatformUserId: redactPlatformUserId(row.targetPlatformUserId, level),
      targetPlatformTenantId: redactTenantOrWorkspaceId(row.targetPlatformTenantId, level),
      workspacePublicId: redactTenantOrWorkspaceId(ws, level),
      summary: redactSummary(row.summary, level),
      changedFields,
      before,
      after,
      sensitivityTier: tier,
    }
  }

  private buildFilters(query: {
    platformTenantId?: string
    workspacePublicId?: string
    actorPlatformUserId?: string
    category?: PlatformAuditListFilters["category"]
    action?: string
    from?: Date
    to?: Date
  }): PlatformAuditListFilters {
    const now = new Date()
    const defaultFrom = new Date(now.getTime() - PLATFORM_AUDIT_RETENTION_MS)
    const fromInclusive = query.from ?? defaultFrom
    const toInclusive = query.to ?? now
    if (fromInclusive.getTime() > toInclusive.getTime()) {
      throw new PlatformAuditReadValidationError(
        "INVALID_RANGE",
        "El rango de fechas es inválido (from > to).",
      )
    }
    return {
      platformTenantId: query.platformTenantId,
      workspacePublicId: query.workspacePublicId,
      actorPlatformUserId: query.actorPlatformUserId,
      category: query.category,
      action: query.action as PlatformAuditListFilters["action"],
      fromInclusive,
      toInclusive,
    }
  }

  async list(
    session: PlatformSessionContext,
    query: Parameters<PlatformAuditReadService["buildFilters"]>[0] & { limit: number; offset: number },
  ): Promise<{ items: PlatformAuditEventPublic[]; total: number }> {
    assertPlatformSessionCanReadAudit(session)
    const filters = this.buildFilters(query)
    const [items, total] = await Promise.all([
      this.query.list(filters, { limit: query.limit, offset: query.offset }),
      this.query.count(filters),
    ])
    return { items: items.map((r) => this.toPublic(session, r)), total }
  }

  async getById(session: PlatformSessionContext, platformAuditEventId: string): Promise<PlatformAuditEventPublic> {
    assertPlatformSessionCanReadAudit(session)
    const row = await this.query.findById(platformAuditEventId)
    if (!row) {
      throw new PlatformAuditReadNotFoundError("NOT_FOUND", "Evento de auditoría no encontrado.")
    }
    const now = new Date()
    const minTs = now.getTime() - PLATFORM_AUDIT_RETENTION_MS
    if (row.occurredAt.getTime() < minTs) {
      throw new PlatformAuditReadNotFoundError("NOT_FOUND", "Evento fuera de la ventana de retención.")
    }
    return this.toPublic(session, row)
  }

  async export(
    session: PlatformSessionContext,
    query: Parameters<PlatformAuditReadService["buildFilters"]>[0] & { format: "csv" | "json" },
  ): Promise<{ contentType: string; filename: string; body: string }> {
    assertPlatformSessionCanReadAudit(session)
    const filters = this.buildFilters(query)
    const total = await this.query.count(filters)
    const take = Math.min(PLATFORM_AUDIT_EXPORT_MAX_ROWS, total)
    const rows = await this.query.list(filters, { limit: take, offset: 0 })
    const items = rows.map((r) => this.toPublic(session, r))
    const stamp = new Date().toISOString().slice(0, 10)
    if (query.format === "json") {
      return {
        contentType: "application/json; charset=utf-8",
        filename: `platform-audit-${stamp}.json`,
        body: JSON.stringify({ exportedAt: new Date().toISOString(), total, rowCount: items.length, items }, null, 2),
      }
    }
    const header = [
      "platformAuditEventId",
      "timestamp",
      "category",
      "action",
      "actorPlatformUserId",
      "actorRole",
      "targetPlatformUserId",
      "targetPlatformTenantId",
      "workspacePublicId",
      "summary",
      "changedFields",
      "sensitivityTier",
    ]
    const lines = [
      header.join(","),
      ...items.map((ev) =>
        [
          ev.platformAuditEventId,
          ev.timestamp,
          ev.category,
          ev.action,
          ev.actorPlatformUserId,
          ev.actorRole,
          ev.targetPlatformUserId ?? "",
          ev.targetPlatformTenantId ?? "",
          ev.workspacePublicId ?? "",
          ev.summary,
          ev.changedFields?.join("|") ?? "",
          ev.sensitivityTier,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ]
    return {
      contentType: "text/csv; charset=utf-8",
      filename: `platform-audit-${stamp}.csv`,
      body: lines.join("\n"),
    }
  }
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
