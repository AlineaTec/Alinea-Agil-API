import type { CommercialQuote } from "../../commercial-pricing/compute-commercial-quote.js"
import { computeManagedWorkspaceCommercial } from "../../commercial-pricing/managed-workspace-commercial.js"
import { workspaceLicenseToTenantEmbed } from "../../platform-licensing/domain/build-platform-license-view.js"
import type { PlatformTenantLicenseSummaryEmbed } from "../../platform-licensing/domain/platform-license-view.js"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { PlatformAuditService } from "../../platform-users/services/platform-audit.service.js"
import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import { platformAdminLicensingTenantPath } from "../../platform/admin-paths.js"
import type { PlatformHealthStatus } from "../../platform/platform-health-status.js"
import type { PlatformTenantState } from "../domain/platform-tenant.entity.js"
import {
  PlatformTenantNotFoundError,
  PlatformTenantValidationError,
} from "../domain/platform-tenant.errors.js"
import type { PlatformTenantStatus } from "../domain/platform-tenant-status.js"
import type { PlatformTenantRepository } from "../persistence/platform-tenant.repository.js"
import type { ProjectApproachCounts } from "../persistence/platform-tenant-metrics.reader.js"
import type { PlatformTenantMetricsReader } from "../persistence/platform-tenant-metrics.reader.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../persistence/workspace-catalog.repository.js"
import {
  assertPlatformSessionCanMutateTenantStatus,
  assertPlatformSessionCanReadTenants,
} from "../policies/platform-tenants.policy.js"

export type PlatformTenantListItemPublic = {
  platformTenantId: string
  workspacePublicId: string
  displayName: string
  code: string
  modality: WorkspaceCatalogRow["modality"]
  status: PlatformTenantStatus
  healthStatus: PlatformHealthStatus
  createdAt: string
  updatedAt: string
  aggregates: {
    projectsCount: number
    activeMembersCount: number
  }
  licenseSummary: PlatformTenantLicenseSummaryPublic | null
  licensingDeepLink: string
}

export type PlatformTenantDetailPublic = PlatformTenantListItemPublic & {
  aggregates: PlatformTenantListItemPublic["aggregates"] & {
    dominantMethodology: "scrum" | "kanban" | "mixed" | "none"
    scrumProjects: number
    kanbanProjects: number
    otherProjects: number
  }
  /**
   * Estimación USD con `commercial-pricing` (asientos = fila operativa de licencias).
   * No sustituye un módulo de billing contractual.
   */
  billingEstimate: CommercialQuote | null
}

export type PlatformTenantLicenseSummaryPublic = PlatformTenantLicenseSummaryEmbed

function dominantMethodology(counts: ProjectApproachCounts): "scrum" | "kanban" | "mixed" | "none" {
  const { scrum, kanban, other } = counts
  if (scrum === 0 && kanban === 0 && other === 0) return "none"
  if (scrum > 0 && kanban === 0) return other > 0 ? "mixed" : "scrum"
  if (kanban > 0 && scrum === 0) return other > 0 ? "mixed" : "kanban"
  if (scrum > 0 && kanban > 0) return scrum === kanban ? "mixed" : scrum > kanban ? "scrum" : "kanban"
  return "none"
}

function resolveTenantHealthStatus(
  tenantStatus: PlatformTenantStatus,
  license: WorkspaceLicenseState | null,
): PlatformHealthStatus {
  if (tenantStatus === "suspended") return "warning"
  if (license && license.seatsAssigned > license.seatsPurchased) return "warning"
  if (!license) return "no_data"
  return "normal"
}

export class PlatformTenantsService {
  constructor(
    private readonly tenants: PlatformTenantRepository,
    private readonly catalog: WorkspaceCatalogRepository,
    private readonly metrics: PlatformTenantMetricsReader,
    private readonly licenses: WorkspaceLicenseRepository,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(
    session: PlatformSessionContext,
    opts: { q?: string; limit: number; offset: number },
  ): Promise<{ items: PlatformTenantListItemPublic[]; total: number }> {
    assertPlatformSessionCanReadTenants(session)
    const rows = await this.catalog.listAll(opts.q)
    const total = rows.length
    const slice = rows.slice(opts.offset, opts.offset + opts.limit)
    const ids = slice.map((r) => r.workspacePublicId)
    const byWs = await this.tenants.ensureForWorkspacePublicIds(ids)

    const items: PlatformTenantListItemPublic[] = await Promise.all(
      slice.map(async (ws) => {
        const t = byWs.get(ws.workspacePublicId)
        if (!t) throw new Error("platform_tenant_mapping_missing")
        return this.buildListItem(ws, t)
      }),
    )
    return { items, total }
  }

  async getByPlatformTenantId(
    session: PlatformSessionContext,
    platformTenantId: string,
  ): Promise<PlatformTenantDetailPublic> {
    assertPlatformSessionCanReadTenants(session)
    const t = await this.tenants.findByPlatformTenantId(platformTenantId)
    if (!t) {
      throw new PlatformTenantNotFoundError("NOT_FOUND", "Tenant de plataforma no encontrado.")
    }
    const ws = await this.catalog.findByPublicId(t.workspacePublicId)
    if (!ws) {
      throw new PlatformTenantNotFoundError("NOT_FOUND", "Workspace asociado no encontrado.")
    }
    return this.buildDetail(ws, t)
  }

  async getByWorkspacePublicId(
    session: PlatformSessionContext,
    workspacePublicId: string,
  ): Promise<PlatformTenantDetailPublic> {
    assertPlatformSessionCanReadTenants(session)
    const byWs = await this.tenants.ensureForWorkspacePublicIds([workspacePublicId])
    const t = byWs.get(workspacePublicId)
    if (!t) throw new PlatformTenantNotFoundError("NOT_FOUND", "Tenant no encontrado.")
    const ws = await this.catalog.findByPublicId(workspacePublicId)
    if (!ws) {
      throw new PlatformTenantNotFoundError("NOT_FOUND", "Workspace no encontrado.")
    }
    return this.buildDetail(ws, t)
  }

  async patchStatus(
    session: PlatformSessionContext,
    platformTenantId: string,
    nextStatus: PlatformTenantStatus,
  ): Promise<PlatformTenantDetailPublic> {
    assertPlatformSessionCanReadTenants(session)
    assertPlatformSessionCanMutateTenantStatus(session)

    const t = await this.tenants.findByPlatformTenantId(platformTenantId)
    if (!t) {
      throw new PlatformTenantNotFoundError("NOT_FOUND", "Tenant de plataforma no encontrado.")
    }
    if (t.status === nextStatus) {
      throw new PlatformTenantValidationError("NO_OP", "El tenant ya está en ese estado.")
    }
    if (!isValidTransition(t.status, nextStatus)) {
      throw new PlatformTenantValidationError(
        "INVALID_TRANSITION",
        "Transición de estado no permitida (v1: active ↔ suspended).",
      )
    }

    const before = { status: t.status }
    t.status = nextStatus
    t.updatedAt = new Date()
    await this.tenants.save(t)

    const action = nextStatus === "suspended" ? "tenant.suspended" : "tenant.reactivated"
    await this.audit.recordTenantEvent(
      session,
      action,
      platformTenantId,
      action === "tenant.suspended" ? "Tenant suspendido" : "Tenant reactivado",
      before,
      { status: nextStatus, workspacePublicId: t.workspacePublicId },
      t.workspacePublicId,
    )

    const ws = await this.catalog.findByPublicId(t.workspacePublicId)
    if (!ws) {
      throw new PlatformTenantNotFoundError("NOT_FOUND", "Workspace asociado no encontrado.")
    }
    return this.buildDetail(ws, t)
  }

  private async buildListItem(ws: WorkspaceCatalogRow, t: PlatformTenantState): Promise<PlatformTenantListItemPublic> {
    const [projectsCount, activeMembersCount, license] = await Promise.all([
      this.metrics.countProjects(ws.workspacePublicId),
      this.metrics.countActiveMembers(ws.workspacePublicId),
      this.licenses.findByWorkspacePublicId(ws.workspacePublicId),
    ])
    const health = resolveTenantHealthStatus(t.status, license)
    return {
      platformTenantId: t.platformTenantId,
      workspacePublicId: ws.workspacePublicId,
      displayName: ws.displayName,
      code: ws.code,
      modality: ws.modality,
      status: t.status,
      healthStatus: health,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      aggregates: { projectsCount, activeMembersCount },
      licenseSummary: license
        ? workspaceLicenseToTenantEmbed(license, ws.modality)
        : null,
      licensingDeepLink: platformAdminLicensingTenantPath(t.platformTenantId),
    }
  }

  private async buildDetail(ws: WorkspaceCatalogRow, t: PlatformTenantState): Promise<PlatformTenantDetailPublic> {
    const [projectsCount, activeMembersCount, approach, license] = await Promise.all([
      this.metrics.countProjects(ws.workspacePublicId),
      this.metrics.countActiveMembers(ws.workspacePublicId),
      this.metrics.countProjectsByApproach(ws.workspacePublicId),
      this.licenses.findByWorkspacePublicId(ws.workspacePublicId),
    ])
    const health = resolveTenantHealthStatus(t.status, license)
    const dm = dominantMethodology(approach)
    const commercial = computeManagedWorkspaceCommercial({
      plan: ws.modality,
      billingCadence: ws.billingCadence,
      license,
    })
    const billingEstimate: CommercialQuote | null = commercial.ok ? commercial.quote : null
    return {
      platformTenantId: t.platformTenantId,
      workspacePublicId: ws.workspacePublicId,
      displayName: ws.displayName,
      code: ws.code,
      modality: ws.modality,
      status: t.status,
      healthStatus: health,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      aggregates: {
        projectsCount,
        activeMembersCount,
        dominantMethodology: dm,
        scrumProjects: approach.scrum,
        kanbanProjects: approach.kanban,
        otherProjects: approach.other,
      },
      licenseSummary: license
        ? workspaceLicenseToTenantEmbed(license, ws.modality)
        : null,
      licensingDeepLink: platformAdminLicensingTenantPath(t.platformTenantId),
      billingEstimate,
    }
  }
}

function isValidTransition(from: PlatformTenantStatus, to: PlatformTenantStatus): boolean {
  if (from === "active" && to === "suspended") return true
  if (from === "suspended" && to === "active") return true
  return false
}
