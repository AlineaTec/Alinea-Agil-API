import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformAuditAction } from "../../platform-users/domain/platform-audit-action.js"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import {
  PlatformAuditReadForbiddenError,
  PlatformAuditReadNotFoundError,
} from "../domain/platform-audit-read.errors.js"
import type {
  PlatformAuditListFilters,
  PlatformAuditQueryRepository,
  PlatformAuditEventRow,
} from "../persistence/platform-audit-query.repository.js"
import {
  PLATFORM_AUDIT_EXPORT_MAX_ROWS,
  PLATFORM_AUDIT_RETENTION_MS,
  PlatformAuditReadService,
} from "./platform-audit-read.service.js"

function superSession(): PlatformSessionContext {
  return { platformUserId: "s", email: "s@test", role: "platform_super_admin" }
}
function operatorSession(): PlatformSessionContext {
  return { platformUserId: "o", email: "o@test", role: "platform_operator" }
}
function auditorSession(): PlatformSessionContext {
  return { platformUserId: "a", email: "a@test", role: "platform_auditor" }
}

function row(over: Partial<PlatformAuditEventRow> = {}): PlatformAuditEventRow {
  const now = new Date()
  const base: PlatformAuditEventRow = {
    platformAuditEventId: randomUUID(),
    occurredAt: now,
    actorPlatformUserId: randomUUID(),
    actorRole: "platform_super_admin",
    action: "tenant.suspended",
    targetPlatformUserId: null,
    targetPlatformTenantId: randomUUID(),
    workspacePublicId: randomUUID(),
    summary: "Tenant suspendido",
    payloadBefore: { status: "active" },
    payloadAfter: { status: "suspended", workspacePublicId: "ws-embed" },
    ...over,
  }
  return base
}

function matchesFilters(r: PlatformAuditEventRow, f: PlatformAuditListFilters): boolean {
  const OPS_ACTIONS = new Set<string>([
    "billing.workspace_paddle_reconcile",
    "registration.intents_deleted",
    "registration.intents_purge_unprovisioned",
  ])
  if (r.occurredAt.getTime() < f.fromInclusive.getTime() || r.occurredAt.getTime() > f.toInclusive.getTime()) {
    return false
  }
  if (f.platformTenantId && r.targetPlatformTenantId !== f.platformTenantId) return false
  if (f.actorPlatformUserId && r.actorPlatformUserId !== f.actorPlatformUserId) return false
  if (f.action && r.action !== f.action) return false
  if (f.category === "platform_identity" && !r.action.startsWith("platform_user.")) return false
  if (f.category === "platform_tenant" && !r.action.startsWith("tenant.")) return false
  if (f.category === "platform_operations" && !OPS_ACTIONS.has(r.action)) return false
  if (f.category === "platform_licensing") {
    if (r.action.startsWith("platform_user.") || r.action.startsWith("tenant.") || OPS_ACTIONS.has(r.action)) {
      return false
    }
  }
  if (f.workspacePublicId) {
    const ws =
      r.workspacePublicId ??
      (typeof r.payloadAfter === "object" &&
      r.payloadAfter !== null &&
      "workspacePublicId" in r.payloadAfter &&
      typeof (r.payloadAfter as { workspacePublicId?: string }).workspacePublicId === "string"
        ? (r.payloadAfter as { workspacePublicId: string }).workspacePublicId
        : null)
    if (ws !== f.workspacePublicId) return false
  }
  return true
}

class MemoryQuery implements PlatformAuditQueryRepository {
  constructor(public rows: PlatformAuditEventRow[]) {}

  async list(
    filters: PlatformAuditListFilters,
    opts: { limit: number; offset: number },
  ): Promise<PlatformAuditEventRow[]> {
    const filtered = this.rows.filter((r) => matchesFilters(r, filters))
    filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    return filtered.slice(opts.offset, opts.offset + opts.limit)
  }

  async count(filters: PlatformAuditListFilters): Promise<number> {
    return this.rows.filter((r) => matchesFilters(r, filters)).length
  }

  async findById(platformAuditEventId: string): Promise<PlatformAuditEventRow | null> {
    return this.rows.find((r) => r.platformAuditEventId === platformAuditEventId) ?? null
  }
}

describe("PlatformAuditReadService", () => {
  it("lists for super admin and filters by tenant actor category date", async () => {
    const tenantId = randomUUID()
    const actorId = randomUUID()
    const old = new Date(Date.now() - PLATFORM_AUDIT_RETENTION_MS - 86_400_000)
    const rows = [
      row({
        targetPlatformTenantId: tenantId,
        actorPlatformUserId: actorId,
        occurredAt: new Date(),
        action: "tenant.reactivated",
      }),
      row({ occurredAt: old, summary: "stale" }),
      row({
        action: "platform_user.invited" as PlatformAuditAction,
        summary: "invite",
        targetPlatformUserId: randomUUID(),
        targetPlatformTenantId: null,
        workspacePublicId: null,
        payloadAfter: { email: "x@test.com", role: "platform_operator" },
      }),
    ]
    const svc = new PlatformAuditReadService(new MemoryQuery(rows))
    const byTenant = await svc.list(superSession(), {
      platformTenantId: tenantId,
      limit: 50,
      offset: 0,
    })
    assert.equal(byTenant.items.length, 1)
    assert.equal(byTenant.items[0].action, "tenant.reactivated")

    const byActor = await svc.list(superSession(), {
      actorPlatformUserId: actorId,
      limit: 50,
      offset: 0,
    })
    assert.equal(byActor.total, 1)

    const byCat = await svc.list(superSession(), {
      category: "platform_identity",
      limit: 50,
      offset: 0,
    })
    assert.equal(byCat.total, 1)
    assert.ok(byCat.items[0].action.startsWith("platform_user."))
  })

  it("redacts more for auditor than operator on elevated action", async () => {
    const uid = randomUUID()
    const r = row({
      action: "platform_user.invited",
      actorPlatformUserId: uid,
      summary: "Invitación a user@test.com",
      payloadBefore: null,
      targetPlatformUserId: randomUUID(),
      targetPlatformTenantId: null,
      workspacePublicId: null,
      payloadAfter: { email: "user@test.com", role: "platform_operator" },
    })
    const svc = new PlatformAuditReadService(new MemoryQuery([r]))
    const op = await svc.list(operatorSession(), { limit: 10, offset: 0 })
    const aud = await svc.list(auditorSession(), { limit: 10, offset: 0 })
    assert.equal(op.items[0].actorPlatformUserId, uid)
    assert.notEqual(aud.items[0].actorPlatformUserId, uid)
    assert.ok(aud.items[0].summary.includes("[email_redacted]"))
    assert.equal(aud.items[0].after, null)
    assert.ok(op.items[0].after !== null || op.items[0].changedFields !== null)
  })

  it("detail rejects outside retention window", async () => {
    const stale = row({ occurredAt: new Date(Date.now() - PLATFORM_AUDIT_RETENTION_MS - 10_000) })
    const svc = new PlatformAuditReadService(new MemoryQuery([stale]))
    await assert.rejects(
      () => svc.getById(superSession(), stale.platformAuditEventId),
      (e: unknown) => e instanceof PlatformAuditReadNotFoundError,
    )
  })

  it("export csv respects redaction and row cap", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row({
        platformAuditEventId: randomUUID(),
        summary: `ev ${i}`,
        occurredAt: new Date(Date.now() - i * 1000),
      }),
    )
    const svc = new PlatformAuditReadService(new MemoryQuery(many))
    const out = await svc.export(auditorSession(), { format: "csv" })
    assert.ok(out.body.includes("platformAuditEventId"))
    assert.ok(out.filename.endsWith(".csv"))
    const lines = out.body.split("\n").filter(Boolean)
    assert.ok(lines.length <= PLATFORM_AUDIT_EXPORT_MAX_ROWS + 1)
  })

  it("rejects non-platform role", async () => {
    const svc = new PlatformAuditReadService(new MemoryQuery([]))
    const bad = { platformUserId: "x", email: "x", role: "scrum_master" } as unknown as PlatformSessionContext
    await assert.rejects(
      () => svc.list(bad, { limit: 10, offset: 0 }),
      (e: unknown) => e instanceof PlatformAuditReadForbiddenError,
    )
  })
})
