/**
 * Vista plataforma de licencias operativas (solo lectura v1).
 * Fuente: `workspace-licenses` / `WorkspaceLicenseState`.
 */

export type PlatformLicenseOperationalStatus = "aligned" | "over_assigned"

export type PlatformLicenseWarning = {
  code: "NO_LICENSE_ROW" | "OVER_ASSIGNED"
  message: string
}

export type PlatformLicenseSummaryBlock = {
  contractedSeats: number
  assignedSeats: number
  availableSeats: number
  operationalStatus: PlatformLicenseOperationalStatus
  pendingSeatReduction: {
    targetPurchasedAfterRenewal: number
    appliesOn: string
  } | null
  nextRenewalDate: string
  lastRenewalAt: string | null
}

/**
 * Respuesta HTTP del slice admin-licensing (detalle por tenant/workspace).
 */
export type PlatformLicenseViewPublic = {
  platformTenantId: string
  workspacePublicId: string
  licenseSummary: PlatformLicenseSummaryBlock | null
  /** Plan de workspace (catálogo); no sustituye contrato de billing. */
  workspacePlanKind: "individual" | "team" | null
  /** v1: sin postura comercial enriquecida; reservado. */
  commercialPosture: null
  calculatedAt: string
  misalignment: {
    overAssigned: boolean
    /** Exceso de asignados sobre contratados;0 si no aplica. */
    seatsOverContractBy: number
  }
  warnings: PlatformLicenseWarning[]
  dataSource: "workspace_licenses_v1"
}

/**
 * Forma embebida en `platform-tenants` (mismos números que la fuente operativa).
 * Nombres históricos `seatsPurchased` / `seatsAssigned` alineados al dominio cliente.
 */
export type PlatformTenantLicenseSummaryEmbed = {
  workspacePublicId: string
  seatsPurchased: number
  seatsAssigned: number
  seatsAvailable: number
  nextRenewalDate: string
  lastRenewalAt: string | null
  planType: "individual" | "team" | null
  licensingHealth: "ok" | "over_assigned"
}
