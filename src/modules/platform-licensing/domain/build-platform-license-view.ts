import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import { toSummary } from "../../workspace-licenses/domain/workspace-license-state.js"
import type {
  PlatformLicenseViewPublic,
  PlatformLicenseWarning,
  PlatformTenantLicenseSummaryEmbed,
} from "./platform-license-view.js"

export function workspaceLicenseToTenantEmbed(
  license: WorkspaceLicenseState,
  planType: "individual" | "team" | null = null,
): PlatformTenantLicenseSummaryEmbed {
  const s = toSummary(license)
  return {
    workspacePublicId: s.workspacePublicId,
    seatsPurchased: s.seatsPurchased,
    seatsAssigned: s.seatsAssigned,
    seatsAvailable: s.seatsAvailable,
    nextRenewalDate: s.nextRenewalDate.toISOString(),
    lastRenewalAt: s.lastRenewalAt ? s.lastRenewalAt.toISOString() : null,
    planType,
    licensingHealth: license.seatsAssigned > license.seatsPurchased ? "over_assigned" : "ok",
  }
}

export function buildPlatformLicenseView(
  platformTenantId: string,
  workspacePublicId: string,
  license: WorkspaceLicenseState | null,
  calculatedAt: Date,
  workspacePlanKind: "individual" | "team" | null = null,
): PlatformLicenseViewPublic {
  const warnings: PlatformLicenseWarning[] = []

  if (!license) {
    warnings.push({
      code: "NO_LICENSE_ROW",
      message: "No existe fila de licencia operativa para este workspace.",
    })
    return {
      platformTenantId,
      workspacePublicId,
      licenseSummary: null,
      workspacePlanKind,
      commercialPosture: null,
      calculatedAt: calculatedAt.toISOString(),
      misalignment: { overAssigned: false, seatsOverContractBy: 0 },
      warnings,
      dataSource: "workspace_licenses_v1",
    }
  }

  const overAssigned = license.seatsAssigned > license.seatsPurchased
  const seatsOverContractBy = overAssigned ? license.seatsAssigned - license.seatsPurchased : 0
  if (overAssigned) {
    warnings.push({
      code: "OVER_ASSIGNED",
      message:
        "Los asientos asignados superan los contratados; revisar sincronización entre membresías y licencias.",
    })
  }

  const s = toSummary(license)
  return {
    platformTenantId,
    workspacePublicId,
    workspacePlanKind,
    licenseSummary: {
      contractedSeats: license.seatsPurchased,
      assignedSeats: license.seatsAssigned,
      availableSeats: s.seatsAvailable,
      operationalStatus: overAssigned ? "over_assigned" : "aligned",
      pendingSeatReduction: license.pendingSeatReduction
        ? {
            targetPurchasedAfterRenewal: license.pendingSeatReduction.targetPurchasedAfterRenewal,
            appliesOn: license.pendingSeatReduction.appliesOn.toISOString(),
          }
        : null,
      nextRenewalDate: license.nextRenewalDate.toISOString(),
      lastRenewalAt: license.lastRenewalAt ? license.lastRenewalAt.toISOString() : null,
    },
    commercialPosture: null,
    calculatedAt: calculatedAt.toISOString(),
    misalignment: { overAssigned, seatsOverContractBy },
    warnings,
    dataSource: "workspace_licenses_v1",
  }
}
