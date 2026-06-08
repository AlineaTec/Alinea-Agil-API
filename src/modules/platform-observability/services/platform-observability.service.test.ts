import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformTenantState } from "../../platform-tenants/domain/platform-tenant.entity.js"
import type { PlatformTenantRepository } from "../../platform-tenants/persistence/platform-tenant.repository.js"
import type { PlatformTenantMetricsReader } from "../../platform-tenants/persistence/platform-tenant-metrics.reader.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import { PlatformObservabilityForbiddenError } from "../domain/platform-observability.errors.js"
import { PlatformObservabilityService } from "./platform-observability.service.js"

function superSession(): PlatformSessionContext {
  return { platformUserId: "s", email: "s@test", role: "platform_super_admin" }
}
function operatorSession(): PlatformSessionContext {
  return { platformUserId: "o", email: "o@test", role: "platform_operator" }
}
function auditorSession(): PlatformSessionContext {
  return { platformUserId: "a", email: "a@test", role: "platform_auditor" }
}

class MemoryTenants implements PlatformTenantRepository {
  constructor(public rows: PlatformTenantState[]) {}
  async insert(): Promise<void> {
    throw new Error("not_used")
  }
  async save(): Promise<void> {
    throw new Error("not_used")
  }
  async findByPlatformTenantId(id: string): Promise<PlatformTenantState | null> {
    return this.rows.find((r) => r.platformTenantId === id) ?? null
  }
  async findByWorkspacePublicId(): Promise<PlatformTenantState | null> {
    throw new Error("not_used")
  }
  async findByWorkspacePublicIds(): Promise<Map<string, PlatformTenantState>> {
    throw new Error("not_used")
  }
  async ensureForWorkspacePublicIds(ids: string[]): Promise<Map<string, PlatformTenantState>> {
    const m = new Map<string, PlatformTenantState>()
    for (const id of ids) {
      const r = this.rows.find((x) => x.workspacePublicId === id)
      if (r) m.set(id, r)
    }
    return m
  }
}

class MemoryCatalog implements WorkspaceCatalogRepository {
  constructor(public workspaces: WorkspaceCatalogRow[]) {}
  async listAll(search?: string): Promise<WorkspaceCatalogRow[]> {
    const q = search?.trim().toLowerCase()
    if (!q) return [...this.workspaces]
    return this.workspaces.filter(
      (w) => w.displayName.toLowerCase().includes(q) || w.code.toLowerCase().includes(q),
    )
  }
  async findByPublicId(workspacePublicId: string): Promise<WorkspaceCatalogRow | null> {
    return this.workspaces.find((w) => w.workspacePublicId === workspacePublicId) ?? null
  }
}

class MemoryMetrics implements PlatformTenantMetricsReader {
  async countProjects(): Promise<number> {
    return 1
  }
  async countActiveMembers(): Promise<number> {
    return 2
  }
  async countProjectsByApproach(): Promise<{ scrum: number; kanban: number; other: number }> {
    return { scrum: 0, kanban: 0, other: 0 }
  }
}

class MemoryLicenses implements WorkspaceLicenseRepository {
  constructor(private readonly map: Map<string, WorkspaceLicenseState | null>) {}
  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceLicenseState | null> {
    if (!this.map.has(workspacePublicId)) return null
    return this.map.get(workspacePublicId) ?? null
  }
  async findManyByWorkspacePublicIds(workspacePublicIds: string[]): Promise<Map<string, WorkspaceLicenseState>> {
    const m = new Map<string, WorkspaceLicenseState>()
    for (const id of workspacePublicIds) {
      if (!this.map.has(id)) continue
      const s = this.map.get(id)
      if (s) m.set(id, s)
    }
    return m
  }
  async insertInitial(): Promise<void> {
    throw new Error("not_used")
  }
  async replace(): Promise<void> {
    throw new Error("not_used")
  }
}

function wsRow(over: Partial<WorkspaceCatalogRow> = {}): WorkspaceCatalogRow {
  const now = new Date()
  return {
    workspacePublicId: randomUUID(),
    code: "c",
    displayName: "D",
    modality: "team",
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function tenantRow(ws: string, over: Partial<PlatformTenantState> = {}): PlatformTenantState {
  const now = new Date()
  return {
    platformTenantId: randomUUID(),
    workspacePublicId: ws,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function license(ws: string, purchased: number, assigned: number): WorkspaceLicenseState {
  const d = new Date("2026-01-01T00:00:00.000Z")
  return {
    workspacePublicId: ws,
    seatsPurchased: purchased,
    seatsAssigned: assigned,
    pendingSeatReduction: null,
    nextRenewalDate: d,
    lastRenewalAt: null,
  }
}

describe("PlatformObservabilityService", () => {
  it("global summary: normal when all tenants healthy", async () => {
    const w = wsRow({ displayName: "Ok" })
    const t = tenantRow(w.workspacePublicId)
    const lic = new MemoryLicenses(new Map([[w.workspacePublicId, license(w.workspacePublicId, 5, 2)]]))
    const svc = new PlatformObservabilityService(
      new MemoryTenants([t]),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      lic,
    )
    const g = await svc.getGlobalSummary(superSession())
    assert.equal(g.healthStatus, "normal")
    assert.equal(g.kpis.warningTenantCount, 0)
    assert.equal(g.kpis.noDataTenantCount, 0)
    assert.equal(g.kpis.activeTenantCount, 1)
    assert.equal(g.kpis.normalTenantCount, 1)
    assert.equal(g.tenantsAttention.length, 0)
  })

  it("global summary: warning for suspended tenant", async () => {
    const w = wsRow()
    const t = tenantRow(w.workspacePublicId, { status: "suspended" })
    const lic = new MemoryLicenses(new Map([[w.workspacePublicId, license(w.workspacePublicId, 1, 1)]]))
    const svc = new PlatformObservabilityService(
      new MemoryTenants([t]),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      lic,
    )
    const g = await svc.getGlobalSummary(operatorSession())
    assert.equal(g.healthStatus, "warning")
    assert.equal(g.kpis.warningTenantCount, 1)
    assert.equal(g.kpis.activeTenantCount, 0)
    assert.ok(g.tenantsAttention.some((x) => x.healthStatus === "warning"))
  })

  it("global summary: no_data without license row", async () => {
    const w = wsRow()
    const t = tenantRow(w.workspacePublicId)
    const lic = new MemoryLicenses(new Map([[w.workspacePublicId, null]]))
    const svc = new PlatformObservabilityService(
      new MemoryTenants([t]),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      lic,
    )
    const g = await svc.getGlobalSummary(auditorSession())
    assert.equal(g.healthStatus, "no_data")
    assert.equal(g.kpis.noDataTenantCount, 1)
    assert.ok(g.kpis.activeWarningsCount >= 1)
    assert.ok(g.tenantsAttention[0].activeWarnings.some((a) => a.code === "LICENSE_ROW_MISSING"))
  })

  it("warning for license over-assigned", async () => {
    const w = wsRow()
    const t = tenantRow(w.workspacePublicId)
    const lic = new MemoryLicenses(new Map([[w.workspacePublicId, license(w.workspacePublicId, 1, 4)]]))
    const svc = new PlatformObservabilityService(
      new MemoryTenants([t]),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      lic,
    )
    const row = await svc.getTenantHealth(superSession(), t.platformTenantId)
    assert.equal(row.healthStatus, "warning")
    assert.ok(row.activeWarnings.some((a) => a.code === "LICENSE_SEATS_OVER_ASSIGNED"))
  })

  it("list attentionOnly filters normals", async () => {
    const w1 = wsRow({ displayName: "A", workspacePublicId: randomUUID() })
    const w2 = wsRow({ displayName: "B", workspacePublicId: randomUUID() })
    const t1 = tenantRow(w1.workspacePublicId)
    const t2 = tenantRow(w2.workspacePublicId, { status: "suspended" })
    const lic = new MemoryLicenses(
      new Map([
        [w1.workspacePublicId, license(w1.workspacePublicId, 2, 1)],
        [w2.workspacePublicId, license(w2.workspacePublicId, 2, 1)],
      ]),
    )
    const svc = new PlatformObservabilityService(
      new MemoryTenants([t1, t2]),
      new MemoryCatalog([w1, w2]),
      new MemoryMetrics(),
      lic,
    )
    const out = await svc.listTenantHealth(superSession(), {
      limit: 50,
      offset: 0,
      attentionOnly: true,
    })
    assert.equal(out.total, 1)
    assert.equal(out.items[0].healthStatus, "warning")
  })

  it("rejects non-platform role", async () => {
    const w = wsRow()
    const t = tenantRow(w.workspacePublicId)
    const svc = new PlatformObservabilityService(
      new MemoryTenants([t]),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      new MemoryLicenses(new Map()),
    )
    const bad = { platformUserId: "x", email: "x", role: "auditor" } as unknown as PlatformSessionContext
    await assert.rejects(
      () => svc.getGlobalSummary(bad),
      (e: unknown) => e instanceof PlatformObservabilityForbiddenError,
    )
  })
})
