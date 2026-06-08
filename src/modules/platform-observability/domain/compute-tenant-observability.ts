import type { WorkspaceLicenseState } from "../../workspace-licenses/domain/workspace-license-state.js"
import type { PlatformTenantState } from "../../platform-tenants/domain/platform-tenant.entity.js"
import type { PlatformHealthStatus } from "../../platform/platform-health-status.js"
import type { PlatformObservabilityActiveWarning } from "./platform-observability-warning.js"

export function computeTenantObservability(
  tenant: PlatformTenantState,
  license: WorkspaceLicenseState | null,
): {
  healthStatus: PlatformHealthStatus
  activeWarnings: PlatformObservabilityActiveWarning[]
} {
  const activeWarnings: PlatformObservabilityActiveWarning[] = []

  if (tenant.status === "suspended") {
    activeWarnings.push({
      code: "TENANT_SUSPENDED",
      severity: "warning",
      message: "El tenant está suspendido a nivel plataforma.",
      relatedModules: ["platform_tenants"],
    })
  }

  if (!license) {
    activeWarnings.push({
      code: "LICENSE_ROW_MISSING",
      severity: "info",
      message: "No hay fila operativa de licencias para este workspace; la salud de licenciamiento no es verificable.",
      relatedModules: ["platform_licensing"],
    })
  } else if (license.seatsAssigned > license.seatsPurchased) {
    activeWarnings.push({
      code: "LICENSE_SEATS_OVER_ASSIGNED",
      severity: "warning",
      message:
        "Los asientos asignados superan los contratados; posible desalineación entre membresías y licencias.",
      relatedModules: ["platform_licensing", "platform_tenants"],
    })
  }

  let healthStatus: PlatformHealthStatus
  if (tenant.status === "suspended" || (license !== null && license.seatsAssigned > license.seatsPurchased)) {
    healthStatus = "warning"
  } else if (!license) {
    healthStatus = "no_data"
  } else {
    healthStatus = "normal"
  }

  return { healthStatus, activeWarnings }
}
