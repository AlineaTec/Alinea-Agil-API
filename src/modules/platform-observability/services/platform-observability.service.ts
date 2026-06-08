import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformTenantState } from "../../platform-tenants/domain/platform-tenant.entity.js"
import type { PlatformTenantStatus } from "../../platform-tenants/domain/platform-tenant-status.js"
import type { PlatformTenantRepository } from "../../platform-tenants/persistence/platform-tenant.repository.js"
import type { PlatformTenantMetricsReader } from "../../platform-tenants/persistence/platform-tenant-metrics.reader.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import {
  platformAdminAuditEventsListPath,
  platformAdminLicensingTenantPath,
  platformAdminTenantDetailPath,
} from "../../platform/admin-paths.js"
import type { PlatformHealthStatus } from "../../platform/platform-health-status.js"
import { computeTenantObservability } from "../domain/compute-tenant-observability.js"
import { PlatformObservabilityNotFoundError } from "../domain/platform-observability.errors.js"
import type { PlatformObservabilityActiveWarning } from "../domain/platform-observability-warning.js"
import { assertPlatformSessionCanReadObservability } from "../policies/platform-observability.policy.js"

/** Origen de verdad v1 (sin caché dedicada; `calculatedAt` por request). */
export const PLATFORM_OBSERVABILITY_DATA_SOURCE =
  "derived_v1:workspace_catalog+platform_tenants+workspace_licenses+operational_counts"

export type TenantObservabilityRowPublic = {
  platformTenantId: string
  workspacePublicId: string
  displayName: string
  tenantPlatformStatus: PlatformTenantStatus
  healthStatus: PlatformHealthStatus
  activeWarnings: PlatformObservabilityActiveWarning[]
  aggregates: {
    projectsCount: number
    activeMembersCount: number
  }
  calculatedAt: string
  dataSource: string
  /** Enlaces contextuales; no sustituyen detalle de tenants/licensing. */
  relatedPaths: {
    tenantAdmin: string
    licensingAdmin: string
  }
}

export type PlatformHealthSummaryPublic = {
  calculatedAt: string
  healthStatus: PlatformHealthStatus
  dataSource: string
  kpis: {
    activeTenantCount: number
    warningTenantCount: number
    noDataTenantCount: number
    normalTenantCount: number
    /** Suma de entradas en `activeWarnings` de todos los tenants. */
    activeWarningsCount: number
  }
  tenantsAttention: Array<{
    platformTenantId: string
    workspacePublicId: string
    displayName: string
    healthStatus: PlatformHealthStatus
    activeWarnings: PlatformObservabilityActiveWarning[]
    rankReason: "warning" | "no_data"
  }>
  /** Si hay más tenants en atención que el tope, se indica aquí. */
  tenantsAttentionTruncated: boolean
  auditContext: {
    note: string
    eventsListPath: string
  }
  cacheNote: string
}

function aggregateGlobalHealth(
  warningN: number,
  noDataN: number,
): PlatformHealthStatus {
  if (warningN > 0) return "warning"
  if (noDataN > 0) return "no_data"
  return "normal"
}

export class PlatformObservabilityService {
  private static readonly ATTENTION_RANK_CAP = 200

  constructor(
    private readonly tenants: PlatformTenantRepository,
    private readonly catalog: WorkspaceCatalogRepository,
    private readonly metrics: PlatformTenantMetricsReader,
    private readonly licenses: WorkspaceLicenseRepository,
  ) {}

  private pathsFor(platformTenantId: string): TenantObservabilityRowPublic["relatedPaths"] {
    return {
      tenantAdmin: platformAdminTenantDetailPath(platformTenantId),
      licensingAdmin: platformAdminLicensingTenantPath(platformTenantId),
    }
  }

  private async buildRow(
    ws: WorkspaceCatalogRow,
    t: PlatformTenantState,
    calculatedAt: string,
  ): Promise<TenantObservabilityRowPublic> {
    const [projectsCount, activeMembersCount, license] = await Promise.all([
      this.metrics.countProjects(ws.workspacePublicId),
      this.metrics.countActiveMembers(ws.workspacePublicId),
      this.licenses.findByWorkspacePublicId(ws.workspacePublicId),
    ])
    const { healthStatus, activeWarnings } = computeTenantObservability(t, license)
    return {
      platformTenantId: t.platformTenantId,
      workspacePublicId: ws.workspacePublicId,
      displayName: ws.displayName,
      tenantPlatformStatus: t.status,
      healthStatus,
      activeWarnings,
      aggregates: { projectsCount, activeMembersCount },
      calculatedAt,
      dataSource: PLATFORM_OBSERVABILITY_DATA_SOURCE,
      relatedPaths: this.pathsFor(t.platformTenantId),
    }
  }

  async getGlobalSummary(session: PlatformSessionContext): Promise<PlatformHealthSummaryPublic> {
    assertPlatformSessionCanReadObservability(session)
    const calculatedAt = new Date().toISOString()
    const workspaces = await this.catalog.listAll()
    const ids = workspaces.map((w) => w.workspacePublicId)
    const byWs = await this.tenants.ensureForWorkspacePublicIds(ids)

    let activeTenantCount = 0
    let warningTenantCount = 0
    let noDataTenantCount = 0
    let normalTenantCount = 0
    let activeWarningsCount = 0
    const attention: PlatformHealthSummaryPublic["tenantsAttention"] = []

    for (const ws of workspaces) {
      const t = byWs.get(ws.workspacePublicId)
      if (!t) continue
      const license = await this.licenses.findByWorkspacePublicId(ws.workspacePublicId)
      const { healthStatus, activeWarnings } = computeTenantObservability(t, license)
      activeWarningsCount += activeWarnings.length
      if (t.status === "active") activeTenantCount += 1
      if (healthStatus === "warning") {
        warningTenantCount += 1
        attention.push({
          platformTenantId: t.platformTenantId,
          workspacePublicId: ws.workspacePublicId,
          displayName: ws.displayName,
          healthStatus,
          activeWarnings,
          rankReason: "warning",
        })
      } else if (healthStatus === "no_data") {
        noDataTenantCount += 1
        attention.push({
          platformTenantId: t.platformTenantId,
          workspacePublicId: ws.workspacePublicId,
          displayName: ws.displayName,
          healthStatus,
          activeWarnings,
          rankReason: "no_data",
        })
      } else {
        normalTenantCount += 1
      }
    }

    attention.sort((a, b) => {
      if (a.rankReason !== b.rankReason) return a.rankReason === "warning" ? -1 : 1
      return a.displayName.localeCompare(b.displayName, "es")
    })

    const truncated = attention.length > PlatformObservabilityService.ATTENTION_RANK_CAP
    const tenantsAttention = attention.slice(0, PlatformObservabilityService.ATTENTION_RANK_CAP)

    return {
      calculatedAt,
      healthStatus: aggregateGlobalHealth(warningTenantCount, noDataTenantCount),
      dataSource: PLATFORM_OBSERVABILITY_DATA_SOURCE,
      kpis: {
        activeTenantCount,
        warningTenantCount,
        noDataTenantCount,
        normalTenantCount,
        activeWarningsCount,
      },
      tenantsAttention,
      tenantsAttentionTruncated: truncated,
      auditContext: {
        note:
          "La auditoría de plataforma registra mutaciones; este resumen de salud no la reemplaza ni la filtra automáticamente.",
        eventsListPath: platformAdminAuditEventsListPath(),
      },
      cacheNote:
        "v1: cálculo on-demand por request. Caché/TTL o jobs programados pueden añadirse sin cambiar el contrato.",
    }
  }

  async listTenantHealth(
    session: PlatformSessionContext,
    opts: { q?: string; limit: number; offset: number; attentionOnly: boolean },
  ): Promise<{ items: TenantObservabilityRowPublic[]; total: number }> {
    assertPlatformSessionCanReadObservability(session)
    const calculatedAt = new Date().toISOString()
    const rows = await this.catalog.listAll(opts.q)
    const ids = rows.map((r) => r.workspacePublicId)
    const byWs = await this.tenants.ensureForWorkspacePublicIds(ids)

    const built: TenantObservabilityRowPublic[] = []
    for (const ws of rows) {
      const t = byWs.get(ws.workspacePublicId)
      if (!t) continue
      const item = await this.buildRow(ws, t, calculatedAt)
      if (opts.attentionOnly && item.healthStatus === "normal") continue
      built.push(item)
    }

    const total = built.length
    const slice = built.slice(opts.offset, opts.offset + opts.limit)
    return { items: slice, total }
  }

  async getTenantHealth(
    session: PlatformSessionContext,
    platformTenantId: string,
  ): Promise<TenantObservabilityRowPublic> {
    assertPlatformSessionCanReadObservability(session)
    const calculatedAt = new Date().toISOString()
    const t = await this.tenants.findByPlatformTenantId(platformTenantId)
    if (!t) {
      throw new PlatformObservabilityNotFoundError("NOT_FOUND", "Tenant de plataforma no encontrado.")
    }
    const ws = await this.catalog.findByPublicId(t.workspacePublicId)
    if (!ws) {
      throw new PlatformObservabilityNotFoundError("NOT_FOUND", "Workspace no encontrado.")
    }
    return this.buildRow(ws, t, calculatedAt)
  }
}
