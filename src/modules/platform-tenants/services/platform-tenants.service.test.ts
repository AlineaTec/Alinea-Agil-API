import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformAuditRepository } from "../../platform-users/persistence/platform-audit.repository.js"
import { PlatformAuditService } from "../../platform-users/services/platform-audit.service.js"
import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import type { PlatformTenantState } from "../domain/platform-tenant.entity.js"
import { PlatformTenantForbiddenError } from "../domain/platform-tenant.errors.js"
import type { PlatformTenantRepository } from "../persistence/platform-tenant.repository.js"
import type { ProjectApproachCounts } from "../persistence/platform-tenant-metrics.reader.js"
import type { PlatformTenantMetricsReader } from "../persistence/platform-tenant-metrics.reader.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../persistence/workspace-catalog.repository.js"
import { PlatformTenantsService } from "./platform-tenants.service.js"

function superSession(): PlatformSessionContext {
  return {
    platformUserId: "p-super",
    email: "super@test.local",
    role: "platform_super_admin",
  }
}

function operatorSession(): PlatformSessionContext {
  return {
    platformUserId: "p-op",
    email: "op@test.local",
    role: "platform_operator",
  }
}

function auditorSession(): PlatformSessionContext {
  return {
    platformUserId: "p-aud",
    email: "aud@test.local",
    role: "platform_auditor",
  }
}

class MemoryTenantRepo implements PlatformTenantRepository {
  rows: PlatformTenantState[] = []

  async insert(state: PlatformTenantState): Promise<void> {
    this.rows.push(structuredClone(state))
  }

  async save(state: PlatformTenantState): Promise<void> {
    const i = this.rows.findIndex((r) => r.platformTenantId === state.platformTenantId)
    if (i === -1) throw new Error("not_found")
    this.rows[i] = structuredClone(state)
  }

  async findByPlatformTenantId(id: string): Promise<PlatformTenantState | null> {
    const r = this.rows.find((x) => x.platformTenantId === id)
    return r ? structuredClone(r) : null
  }

  async findByWorkspacePublicId(wid: string): Promise<PlatformTenantState | null> {
    const r = this.rows.find((x) => x.workspacePublicId === wid)
    return r ? structuredClone(r) : null
  }

  async findByWorkspacePublicIds(ids: string[]): Promise<Map<string, PlatformTenantState>> {
    const m = new Map<string, PlatformTenantState>()
    for (const id of ids) {
      const r = this.rows.find((x) => x.workspacePublicId === id)
      if (r) m.set(id, structuredClone(r))
    }
    return m
  }

  async ensureForWorkspacePublicIds(ids: string[]): Promise<Map<string, PlatformTenantState>> {
    const existing = await this.findByWorkspacePublicIds(ids)
    const now = new Date()
    for (const wid of ids) {
      if (!existing.has(wid)) {
        const t: PlatformTenantState = {
          platformTenantId: randomUUID(),
          workspacePublicId: wid,
          status: "active",
          createdAt: now,
          updatedAt: now,
        }
        await this.insert(t)
        existing.set(wid, structuredClone(t))
      }
    }
    return existing
  }
}

class MemoryCatalog implements WorkspaceCatalogRepository {
  constructor(public workspaces: WorkspaceCatalogRow[]) {}

  async listAll(search?: string): Promise<WorkspaceCatalogRow[]> {
    const q = search?.trim().toLowerCase()
    if (!q) return [...this.workspaces]
    return this.workspaces.filter(
      (w) =>
        w.displayName.toLowerCase().includes(q) ||
        w.code.toLowerCase().includes(q),
    )
  }

  async findByPublicId(workspacePublicId: string): Promise<WorkspaceCatalogRow | null> {
    return this.workspaces.find((w) => w.workspacePublicId === workspacePublicId) ?? null
  }
}

class MemoryMetrics implements PlatformTenantMetricsReader {
  constructor(
    private readonly projects = 2,
    private readonly members = 5,
    private readonly approaches: ProjectApproachCounts = { scrum: 1, kanban: 1, other: 0 },
  ) {}

  async countProjects(): Promise<number> {
    return this.projects
  }

  async countActiveMembers(): Promise<number> {
    return this.members
  }

  async countProjectsByApproach(): Promise<ProjectApproachCounts> {
    return { ...this.approaches }
  }
}

class MemoryLicenses implements WorkspaceLicenseRepository {
  constructor(private readonly byWs: Map<string, WorkspaceLicenseState>) {}

  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceLicenseState | null> {
    return this.byWs.get(workspacePublicId) ?? null
  }

  async findManyByWorkspacePublicIds(workspacePublicIds: string[]): Promise<Map<string, WorkspaceLicenseState>> {
    const m = new Map<string, WorkspaceLicenseState>()
    for (const id of workspacePublicIds) {
      const s = this.byWs.get(id)
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

class MemoryPlatformAudit implements PlatformAuditRepository {
  records: Array<{ action: string; targetPlatformTenantId: string | null }> = []

  async append(r: Parameters<PlatformAuditRepository["append"]>[0]): Promise<void> {
    this.records.push({
      action: r.action,
      targetPlatformTenantId: r.targetPlatformTenantId,
    })
  }
}

function baseLicense(ws: string): WorkspaceLicenseState {
  const d = new Date("2026-01-01T00:00:00.000Z")
  return {
    workspacePublicId: ws,
    seatsPurchased: 10,
    seatsAssigned: 3,
    pendingSeatReduction: null,
    nextRenewalDate: d,
    lastRenewalAt: null,
  }
}

function baseWorkspace(over: Partial<WorkspaceCatalogRow> = {}): WorkspaceCatalogRow {
  const now = new Date()
  return {
    workspacePublicId: randomUUID(),
    code: "acme",
    displayName: "Acme Corp",
    modality: "team",
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe("PlatformTenantsService", () => {
  it("lists tenants with aggregates and license summary for super admin", async () => {
    const w1 = baseWorkspace({ code: "a", displayName: "Alpha" })
    const w2 = baseWorkspace({ code: "b", displayName: "Beta" })
    const licenses = new MemoryLicenses(
      new Map([
        [w1.workspacePublicId, baseLicense(w1.workspacePublicId)],
        [w2.workspacePublicId, baseLicense(w2.workspacePublicId)],
      ]),
    )
    const auditRepo = new MemoryPlatformAudit()
    const service = new PlatformTenantsService(
      new MemoryTenantRepo(),
      new MemoryCatalog([w2, w1]),
      new MemoryMetrics(),
      licenses,
      new PlatformAuditService(auditRepo),
    )
    const out = await service.list(superSession(), { limit: 10, offset: 0 })
    assert.equal(out.total, 2)
    assert.equal(out.items.length, 2)
    assert.ok(out.items[0].platformTenantId)
    assert.equal(out.items[0].workspacePublicId, w2.workspacePublicId)
    assert.ok(out.items[0].licenseSummary)
    assert.equal(out.items[0].aggregates.projectsCount, 2)
  })

  it("filters list by search query", async () => {
    const w1 = baseWorkspace({ displayName: "UniqueXYZ", code: "x" })
    const w2 = baseWorkspace({ displayName: "Other", code: "y" })
    const service = new PlatformTenantsService(
      new MemoryTenantRepo(),
      new MemoryCatalog([w1, w2]),
      new MemoryMetrics(),
      new MemoryLicenses(new Map()),
      new PlatformAuditService(new MemoryPlatformAudit()),
    )
    const out = await service.list(superSession(), { q: "unique", limit: 50, offset: 0 })
    assert.equal(out.total, 1)
    assert.equal(out.items[0].displayName, "UniqueXYZ")
  })

  it("returns detail by platformTenantId with methodology breakdown", async () => {
    const w = baseWorkspace()
    const tenants = new MemoryTenantRepo()
    const now = new Date()
    const tid = randomUUID()
    await tenants.insert({
      platformTenantId: tid,
      workspacePublicId: w.workspacePublicId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    const service = new PlatformTenantsService(
      tenants,
      new MemoryCatalog([w]),
      new MemoryMetrics(3, 4, { scrum: 2, kanban: 1, other: 0 }),
      new MemoryLicenses(new Map([[w.workspacePublicId, baseLicense(w.workspacePublicId)]])),
      new PlatformAuditService(new MemoryPlatformAudit()),
    )
    const d = await service.getByPlatformTenantId(superSession(), tid)
    assert.equal(d.aggregates.dominantMethodology, "scrum")
    assert.equal(d.aggregates.scrumProjects, 2)
    assert.equal(d.aggregates.kanbanProjects, 1)
    assert.equal(d.licensingDeepLink.includes(tid), true)
  })

  it("resolves detail by workspacePublicId", async () => {
    const w = baseWorkspace()
    const service = new PlatformTenantsService(
      new MemoryTenantRepo(),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      new MemoryLicenses(new Map()),
      new PlatformAuditService(new MemoryPlatformAudit()),
    )
    const d = await service.getByWorkspacePublicId(operatorSession(), w.workspacePublicId)
    assert.equal(d.workspacePublicId, w.workspacePublicId)
  })

  it("allows operator and auditor to list", async () => {
    const w = baseWorkspace()
    const svc = new PlatformTenantsService(
      new MemoryTenantRepo(),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      new MemoryLicenses(new Map()),
      new PlatformAuditService(new MemoryPlatformAudit()),
    )
    await svc.list(operatorSession(), { limit: 10, offset: 0 })
    await svc.list(auditorSession(), { limit: 10, offset: 0 })
  })

  it("rejects non-platform role for read", async () => {
    const w = baseWorkspace()
    const svc = new PlatformTenantsService(
      new MemoryTenantRepo(),
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      new MemoryLicenses(new Map()),
      new PlatformAuditService(new MemoryPlatformAudit()),
    )
    const bad = {
      platformUserId: "u",
      email: "e@test",
      role: "agility_lead",
    } as unknown as PlatformSessionContext
    await assert.rejects(
      () => svc.list(bad, { limit: 10, offset: 0 }),
      (e: unknown) => e instanceof PlatformTenantForbiddenError,
    )
  })

  it("suspends and reactivates only as super admin with audit", async () => {
    const w = baseWorkspace()
    const tenants = new MemoryTenantRepo()
    const now = new Date()
    const tid = randomUUID()
    await tenants.insert({
      platformTenantId: tid,
      workspacePublicId: w.workspacePublicId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    const auditRepo = new MemoryPlatformAudit()
    const service = new PlatformTenantsService(
      tenants,
      new MemoryCatalog([w]),
      new MemoryMetrics(),
      new MemoryLicenses(new Map()),
      new PlatformAuditService(auditRepo),
    )
    await assert.rejects(
      () => service.patchStatus(operatorSession(), tid, "suspended"),
      (e: unknown) => e instanceof PlatformTenantForbiddenError,
    )
    const suspended = await service.patchStatus(superSession(), tid, "suspended")
    assert.equal(suspended.status, "suspended")
    assert.equal(suspended.healthStatus, "warning")
    assert.ok(auditRepo.records.some((r) => r.action === "tenant.suspended"))
    const back = await service.patchStatus(superSession(), tid, "active")
    assert.equal(back.status, "active")
    assert.ok(auditRepo.records.some((r) => r.action === "tenant.reactivated"))
  })
})
