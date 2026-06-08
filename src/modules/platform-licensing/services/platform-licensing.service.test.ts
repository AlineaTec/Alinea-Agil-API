import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformTenantState } from "../../platform-tenants/domain/platform-tenant.entity.js"
import type { PlatformTenantRepository } from "../../platform-tenants/persistence/platform-tenant.repository.js"
import type {
  WorkspaceCatalogRepository,
  WorkspaceCatalogRow,
} from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import { PlatformLicensingForbiddenError } from "../domain/platform-licensing.errors.js"
import { PlatformLicensingService } from "./platform-licensing.service.js"

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

class MemoryLicenses implements WorkspaceLicenseRepository {
  constructor(private readonly map: Map<string, WorkspaceLicenseState>) {}
  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceLicenseState | null> {
    return this.map.get(workspacePublicId) ?? null
  }
  async findManyByWorkspacePublicIds(workspacePublicIds: string[]): Promise<Map<string, WorkspaceLicenseState>> {
    const m = new Map<string, WorkspaceLicenseState>()
    for (const id of workspacePublicIds) {
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

class MemoryWorkspaceCatalog implements WorkspaceCatalogRepository {
  constructor(private readonly rows: WorkspaceCatalogRow[]) {}

  async listAll(): Promise<WorkspaceCatalogRow[]> {
    return [...this.rows]
  }

  async findByPublicId(workspacePublicId: string): Promise<WorkspaceCatalogRow | null> {
    return this.rows.find((r) => r.workspacePublicId === workspacePublicId) ?? null
  }
}

function license(ws: string, purchased: number, assigned: number): WorkspaceLicenseState {
  const d = new Date("2026-06-01T00:00:00.000Z")
  return {
    workspacePublicId: ws,
    seatsPurchased: purchased,
    seatsAssigned: assigned,
    pendingSeatReduction: null,
    nextRenewalDate: d,
    lastRenewalAt: null,
  }
}

function catalogRowFor(ws: string): WorkspaceCatalogRow {
  const now = new Date()
  return {
    workspacePublicId: ws,
    code: "t",
    displayName: "T",
    modality: "team",
    createdAt: now,
    updatedAt: now,
  }
}

describe("PlatformLicensingService", () => {
  it("returns aligned license view by platformTenantId for super admin", async () => {
    const ws = randomUUID()
    const tid = randomUUID()
    const now = new Date()
    const tenants = new MemoryTenants([
      { platformTenantId: tid, workspacePublicId: ws, status: "active", createdAt: now, updatedAt: now },
    ])
    const lic = new MemoryLicenses(new Map([[ws, license(ws, 10, 3)]]))
    const svc = new PlatformLicensingService(tenants, lic, new MemoryWorkspaceCatalog([catalogRowFor(ws)]))
    const v = await svc.getByPlatformTenantId(superSession(), tid)
    assert.equal(v.platformTenantId, tid)
    assert.equal(v.workspacePublicId, ws)
    assert.ok(v.licenseSummary)
    assert.equal(v.licenseSummary!.contractedSeats, 10)
    assert.equal(v.licenseSummary!.assignedSeats, 3)
    assert.equal(v.licenseSummary!.availableSeats, 7)
    assert.equal(v.licenseSummary!.operationalStatus, "aligned")
    assert.equal(v.misalignment.overAssigned, false)
    assert.equal(v.warnings.length, 0)
    assert.equal(v.workspacePlanKind, "team")
  })

  it("returns over_assigned and warnings when assigned exceeds contracted", async () => {
    const ws = randomUUID()
    const tid = randomUUID()
    const now = new Date()
    const tenants = new MemoryTenants([
      { platformTenantId: tid, workspacePublicId: ws, status: "active", createdAt: now, updatedAt: now },
    ])
    const lic = new MemoryLicenses(new Map([[ws, license(ws, 5, 8)]]))
    const svc = new PlatformLicensingService(tenants, lic, new MemoryWorkspaceCatalog([catalogRowFor(ws)]))
    const v = await svc.getByPlatformTenantId(operatorSession(), tid)
    assert.equal(v.licenseSummary!.operationalStatus, "over_assigned")
    assert.equal(v.misalignment.overAssigned, true)
    assert.equal(v.misalignment.seatsOverContractBy, 3)
    assert.equal(v.licenseSummary!.availableSeats, -3)
    assert.ok(v.warnings.some((w) => w.code === "OVER_ASSIGNED"))
  })

  it("resolves by workspacePublicId", async () => {
    const ws = randomUUID()
    const tid = randomUUID()
    const now = new Date()
    const tenants = new MemoryTenants([
      { platformTenantId: tid, workspacePublicId: ws, status: "active", createdAt: now, updatedAt: now },
    ])
    const lic = new MemoryLicenses(new Map([[ws, license(ws, 1, 1)]]))
    const row = catalogRowFor(ws)
    row.modality = "individual"
    const svc = new PlatformLicensingService(tenants, lic, new MemoryWorkspaceCatalog([row]))
    const v = await svc.getByWorkspacePublicId(auditorSession(), ws)
    assert.equal(v.platformTenantId, tid)
  })

  it("returns no license row with warning", async () => {
    const ws = randomUUID()
    const tid = randomUUID()
    const now = new Date()
    const tenants = new MemoryTenants([
      { platformTenantId: tid, workspacePublicId: ws, status: "active", createdAt: now, updatedAt: now },
    ])
    const lic = new MemoryLicenses(new Map())
    const svc = new PlatformLicensingService(tenants, lic, new MemoryWorkspaceCatalog([catalogRowFor(ws)]))
    const v = await svc.getByPlatformTenantId(superSession(), tid)
    assert.equal(v.licenseSummary, null)
    assert.ok(v.warnings.some((w) => w.code === "NO_LICENSE_ROW"))
  })

  it("rejects non-platform role", async () => {
    const ws = randomUUID()
    const tid = randomUUID()
    const now = new Date()
    const tenants = new MemoryTenants([
      { platformTenantId: tid, workspacePublicId: ws, status: "active", createdAt: now, updatedAt: now },
    ])
    const svc = new PlatformLicensingService(
      tenants,
      new MemoryLicenses(new Map()),
      new MemoryWorkspaceCatalog([catalogRowFor(ws)]),
    )
    const bad = { platformUserId: "x", email: "x", role: "agility_lead" } as unknown as PlatformSessionContext
    await assert.rejects(
      () => svc.getByPlatformTenantId(bad, tid),
      (e: unknown) => e instanceof PlatformLicensingForbiddenError,
    )
  })
})
