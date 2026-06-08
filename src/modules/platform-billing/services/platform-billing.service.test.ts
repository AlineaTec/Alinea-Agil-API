import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformTenantState } from "../../platform-tenants/domain/platform-tenant.entity.js"
import type { PlatformTenantRepository } from "../../platform-tenants/persistence/platform-tenant.repository.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import { PlatformBillingNotFoundError } from "../domain/platform-billing.errors.js"
import { PlatformBillingService } from "./platform-billing.service.js"

function readerSession(): PlatformSessionContext {
  return {
    platformUserId: "p-op",
    email: "op@test.local",
    role: "platform_operator",
  }
}

class MemoryTenantRepo implements PlatformTenantRepository {
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
  async findByWorkspacePublicIds(ids: string[]): Promise<Map<string, PlatformTenantState>> {
    const m = new Map<string, PlatformTenantState>()
    for (const id of ids) {
      const r = this.rows.find((x) => x.workspacePublicId === id)
      if (r) m.set(id, r)
    }
    return m
  }
  async ensureForWorkspacePublicIds(): Promise<Map<string, PlatformTenantState>> {
    throw new Error("not_used")
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

function ws(
  id: string,
  over: Partial<WorkspaceCatalogRow> & Pick<WorkspaceCatalogRow, "modality">,
): WorkspaceCatalogRow {
  const now = new Date()
  return {
    workspacePublicId: id,
    code: over.code ?? "c",
    displayName: over.displayName ?? "Co",
    modality: over.modality,
    billingCadence: over.billingCadence,
    createdAt: now,
    updatedAt: now,
  }
}

function lic(ws: string, purchased: number): WorkspaceLicenseState {
  const d = new Date("2026-01-01T00:00:00.000Z")
  return {
    workspacePublicId: ws,
    seatsPurchased: purchased,
    seatsAssigned: 1,
    pendingSeatReduction: null,
    nextRenewalDate: d,
    lastRenewalAt: null,
  }
}

function tenant(ws: string, status: PlatformTenantState["status"]): PlatformTenantState {
  const now = new Date()
  return {
    platformTenantId: randomUUID(),
    workspacePublicId: ws,
    status,
    createdAt: now,
    updatedAt: now,
  }
}

describe("PlatformBillingService", () => {
  it("MRR suma equivalentes mensuales solo de activos con licencia", async () => {
    const w1 = randomUUID()
    const w2 = randomUUID()
    const t1 = tenant(w1, "active")
    const t2 = tenant(w2, "active")
    const catalog = new MemoryCatalog([
      ws(w1, { modality: "individual", displayName: "A", code: "a" }),
      ws(w2, { modality: "team", displayName: "B", code: "b", billingCadence: "monthly" }),
    ])
    const licenses = new MemoryLicenses(
      new Map([
        [w1, lic(w1, 1)],
        [w2, lic(w2, 3)],
      ]),
    )
    const svc = new PlatformBillingService(catalog, new MemoryTenantRepo([t1, t2]), licenses)
    const { summary } = await svc.listTenantCommercialRows(readerSession(), {
      sort: "equivalent_monthly_desc",
    })
    assert.equal(summary.billableActiveCount, 2)
    assert.equal(summary.mrrUsd, 57)
    assert.equal(summary.arrUsd, 684)
    assert.equal(summary.seatsBilledAggregateActive, 4)
    assert.equal(summary.planActiveBillable.individual, 1)
    assert.equal(summary.planActiveBillable.team, 1)
  })

  it("excluye suspendidos del MRR", async () => {
    const w1 = randomUUID()
    const t1 = tenant(w1, "suspended")
    const catalog = new MemoryCatalog([ws(w1, { modality: "individual", displayName: "X", code: "x" })])
    const licenses = new MemoryLicenses(new Map([[w1, lic(w1, 1)]]))
    const svc = new PlatformBillingService(catalog, new MemoryTenantRepo([t1]), licenses)
    const { summary } = await svc.listTenantCommercialRows(readerSession(), {
      sort: "equivalent_monthly_desc",
    })
    assert.equal(summary.mrrUsd, 0)
    assert.equal(summary.suspendedWithQuoteCount, 1)
    assert.equal(summary.billableActiveCount, 0)
  })

  it("marca incompleto sin licencia", async () => {
    const w1 = randomUUID()
    const t1 = tenant(w1, "active")
    const catalog = new MemoryCatalog([ws(w1, { modality: "individual", displayName: "Z", code: "z" })])
    const licenses = new MemoryLicenses(new Map())
    const svc = new PlatformBillingService(catalog, new MemoryTenantRepo([t1]), licenses)
    const { items, summary } = await svc.listTenantCommercialRows(readerSession(), {
      sort: "name_asc",
    })
    assert.equal(items.length, 1)
    assert.equal(items[0].commercialLineStatus, "incomplete")
    assert.equal(items[0].incompleteReason, "missing_license")
    assert.equal(summary.tenantsIncompleteCommercial, 1)
    assert.equal(summary.mrrUsd, 0)
  })

  it("getTenantCommercialDetail lanza si no existe", async () => {
    const svc = new PlatformBillingService(
      new MemoryCatalog([]),
      new MemoryTenantRepo([]),
      new MemoryLicenses(new Map()),
    )
    await assert.rejects(
      () => svc.getTenantCommercialDetail(readerSession(), randomUUID()),
      PlatformBillingNotFoundError,
    )
  })
})
