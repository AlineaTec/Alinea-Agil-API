import type { CommercialQuote } from "../../commercial-pricing/compute-commercial-quote.js"
import {
  computeManagedWorkspaceCommercial,
  describeManagedWorkspaceCommercialEs,
} from "../../commercial-pricing/managed-workspace-commercial.js"
import { platformAdminLicensingTenantPath } from "../../platform/admin-paths.js"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformTenantStatus } from "../../platform-tenants/domain/platform-tenant-status.js"
import type { PlatformTenantRepository } from "../../platform-tenants/persistence/platform-tenant.repository.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../../platform-tenants/persistence/workspace-catalog.repository.js"
import { assertPlatformSessionCanReadTenants } from "../../platform-tenants/policies/platform-tenants.policy.js"
import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../../workspace-licenses/persistence/workspace-license.repository.js"
import { PlatformBillingNotFoundError } from "../domain/platform-billing.errors.js"
import type { PlatformBillingTenantListQuery } from "../validation/platform-billing-http.schemas.js"

export type CommercialLineIncompleteReason = "missing_license" | "missing_platform_tenant"

export type PlatformBillingTenantCommercialRow = {
  platformTenantId: string | null
  workspacePublicId: string
  displayName: string
  code: string
  modality: WorkspaceCatalogRow["modality"]
  platformTenantStatus: PlatformTenantStatus | null
  commercialLineStatus: "ok" | "incomplete"
  incompleteReason?: CommercialLineIncompleteReason
  billingCadenceResolved?: "monthly" | "annual"
  billingCadenceAssumedMonthly?: boolean
  seatsContracted?: number
  quote: CommercialQuote | null
  formulaDescriptionEs: string | null
  /** Normalizado para ranking: `quote.equivalentMonthlyUsd` si aplica; si no, null. */
  equivalentMonthlyUsd: number | null
  /** Total del periodo de facturación (1 o 12 meses), alineado a `quote.totalDueUsd`. */
  periodTotalDueUsd: number | null
  /** Si entra en MRR/ARR agregados (activo y línea comercial completa). */
  includedInRecurringRollup: boolean
  licensingDeepLink: string | null
}

export type PlatformBillingSummary = {
  generatedAt: string
  /** Nota para evitar confusión con facturación legal / ERP. */
  scopeNote: string
  mrrUsd: number
  /** Convencion SaaS: ARR = MRR x 12 (equiv. mensual ya amortiza anual con descuento). */
  arrUsd: number
  workspaceCount: number
  tenantsIncompleteCommercial: number
  /** Activos con cotización `ok` (base de MRR). */
  billableActiveCount: number
  suspendedWithQuoteCount: number
  planActiveBillable: {
    individual: number
    team: number
  }
  cadenceActiveBillable: {
    monthly: number
    annual: number
  }
  /** Suma de `quote.seatsBilled` solo tenants activos cotizables. */
  seatsBilledAggregateActive: number
  mrrContributionMonthlyCadenceUsd: number
  mrrContributionAnnualCadenceUsd: number
}

function buildRow(
  ws: WorkspaceCatalogRow,
  tenant: { platformTenantId: string; status: PlatformTenantStatus } | null,
  license: WorkspaceLicenseState | null,
): PlatformBillingTenantCommercialRow {
  const licensingDeepLink = tenant
    ? platformAdminLicensingTenantPath(tenant.platformTenantId)
    : null

  if (!tenant) {
    return {
      platformTenantId: null,
      workspacePublicId: ws.workspacePublicId,
      displayName: ws.displayName,
      code: ws.code,
      modality: ws.modality,
      platformTenantStatus: null,
      commercialLineStatus: "incomplete",
      incompleteReason: "missing_platform_tenant",
      quote: null,
      formulaDescriptionEs: null,
      equivalentMonthlyUsd: null,
      periodTotalDueUsd: null,
      includedInRecurringRollup: false,
      licensingDeepLink,
    }
  }

  const commercial = computeManagedWorkspaceCommercial({
    plan: ws.modality,
    billingCadence: ws.billingCadence,
    license,
  })

  if (!commercial.ok) {
    return {
      platformTenantId: tenant.platformTenantId,
      workspacePublicId: ws.workspacePublicId,
      displayName: ws.displayName,
      code: ws.code,
      modality: ws.modality,
      platformTenantStatus: tenant.status,
      commercialLineStatus: "incomplete",
      incompleteReason: "missing_license",
      quote: null,
      formulaDescriptionEs: null,
      equivalentMonthlyUsd: null,
      periodTotalDueUsd: null,
      includedInRecurringRollup: false,
      licensingDeepLink,
    }
  }

  const includedInRecurringRollup = tenant.status === "active"
  return {
    platformTenantId: tenant.platformTenantId,
    workspacePublicId: ws.workspacePublicId,
    displayName: ws.displayName,
    code: ws.code,
    modality: ws.modality,
    platformTenantStatus: tenant.status,
    commercialLineStatus: "ok",
    billingCadenceResolved: commercial.billingCadenceUsed,
    billingCadenceAssumedMonthly: commercial.billingCadenceAssumedMonthly,
    seatsContracted: commercial.seatsContracted,
    quote: commercial.quote,
    formulaDescriptionEs: describeManagedWorkspaceCommercialEs(commercial),
    equivalentMonthlyUsd: commercial.quote.equivalentMonthlyUsd,
    periodTotalDueUsd: commercial.quote.totalDueUsd,
    includedInRecurringRollup,
    licensingDeepLink,
  }
}

function sortRows(rows: PlatformBillingTenantCommercialRow[], sort: PlatformBillingTenantListQuery["sort"]) {
  const copy = [...rows]
  if (sort === "name_asc") {
    copy.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"))
    return copy
  }
  if (sort === "code_asc") {
    copy.sort((a, b) => a.code.localeCompare(b.code, "es"))
    return copy
  }
  if (sort === "equivalent_monthly_asc") {
    copy.sort((a, b) => {
      const av = a.equivalentMonthlyUsd ?? -1
      const bv = b.equivalentMonthlyUsd ?? -1
      return av - bv
    })
    return copy
  }
  // equivalent_monthly_desc — incompletos al final
  copy.sort((a, b) => {
    const av = a.equivalentMonthlyUsd ?? -1
    const bv = b.equivalentMonthlyUsd ?? -1
    return bv - av
  })
  return copy
}

function summarize(rows: PlatformBillingTenantCommercialRow[]): PlatformBillingSummary {
  let mrrUsd = 0
  let tenantsIncompleteCommercial = 0
  let billableActiveCount = 0
  let suspendedWithQuoteCount = 0
  let seatsBilledAggregateActive = 0
  let mrrContributionMonthlyCadenceUsd = 0
  let mrrContributionAnnualCadenceUsd = 0
  const planActiveBillable = { individual: 0, team: 0 }
  const cadenceActiveBillable = { monthly: 0, annual: 0 }

  for (const r of rows) {
    if (r.commercialLineStatus !== "ok") {
      tenantsIncompleteCommercial += 1
      continue
    }
    if (r.platformTenantStatus === "suspended") {
      suspendedWithQuoteCount += 1
    }
    if (!r.includedInRecurringRollup || !r.quote) continue
    billableActiveCount += 1
    mrrUsd += r.quote.equivalentMonthlyUsd
    seatsBilledAggregateActive += r.quote.seatsBilled
    if (r.quote.plan === "individual") planActiveBillable.individual += 1
    else planActiveBillable.team += 1
    if (r.quote.billingCadence === "monthly") {
      cadenceActiveBillable.monthly += 1
      mrrContributionMonthlyCadenceUsd += r.quote.equivalentMonthlyUsd
    } else {
      cadenceActiveBillable.annual += 1
      mrrContributionAnnualCadenceUsd += r.quote.equivalentMonthlyUsd
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scopeNote:
      "Lectura comercial administrativa: MRR = suma del equivalente mensual (`computeCommercialQuote` / licencia + workspace). No incluye impuestos, facturas ni cobros reales. Tenants suspendidos no suman al MRR.",
    mrrUsd: round2(mrrUsd),
    arrUsd: round2(mrrUsd * 12),
    workspaceCount: rows.length,
    tenantsIncompleteCommercial,
    billableActiveCount,
    suspendedWithQuoteCount,
    planActiveBillable,
    cadenceActiveBillable,
    seatsBilledAggregateActive,
    mrrContributionMonthlyCadenceUsd: round2(mrrContributionMonthlyCadenceUsd),
    mrrContributionAnnualCadenceUsd: round2(mrrContributionAnnualCadenceUsd),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export class PlatformBillingService {
  constructor(
    private readonly catalog: WorkspaceCatalogRepository,
    private readonly tenants: PlatformTenantRepository,
    private readonly licenses: WorkspaceLicenseRepository,
  ) {}

  async listTenantCommercialRows(
    session: PlatformSessionContext,
    query: PlatformBillingTenantListQuery,
  ): Promise<{ summary: PlatformBillingSummary; items: PlatformBillingTenantCommercialRow[] }> {
    assertPlatformSessionCanReadTenants(session)
    const workspaces = await this.catalog.listAll(query.q)
    const ids = workspaces.map((w) => w.workspacePublicId)
    const tenantByWs = await this.tenants.findByWorkspacePublicIds(ids)
    const licenses = await this.licenses.findManyByWorkspacePublicIds(ids)

    const rows = workspaces.map((ws) => {
      const t = tenantByWs.get(ws.workspacePublicId)
      const tenant = t ? { platformTenantId: t.platformTenantId, status: t.status } : null
      const license = licenses.get(ws.workspacePublicId) ?? null
      return buildRow(ws, tenant, license)
    })

    const summary = summarize(rows)
    const items = sortRows(rows, query.sort)
    return { summary, items }
  }

  async getTenantCommercialDetail(
    session: PlatformSessionContext,
    platformTenantId: string,
  ): Promise<PlatformBillingTenantCommercialRow> {
    assertPlatformSessionCanReadTenants(session)
    const t = await this.tenants.findByPlatformTenantId(platformTenantId)
    if (!t) {
      throw new PlatformBillingNotFoundError("Tenant de plataforma no encontrado.")
    }
    const ws = await this.catalog.findByPublicId(t.workspacePublicId)
    if (!ws) {
      throw new PlatformBillingNotFoundError("Workspace no encontrado en catálogo.")
    }
    const license = await this.licenses.findByWorkspacePublicId(t.workspacePublicId)
    return buildRow(ws, { platformTenantId: t.platformTenantId, status: t.status }, license)
  }
}
