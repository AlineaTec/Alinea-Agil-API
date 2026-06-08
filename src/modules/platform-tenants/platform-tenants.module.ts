import type { Router } from "express"
import type { WorkspaceLicenseRepository } from "../workspace-licenses/persistence/workspace-license.repository.js"
import type { PlatformAuditService } from "../platform-users/services/platform-audit.service.js"
import type { PlatformTenantRepository } from "./persistence/platform-tenant.repository.js"
import type { PlatformTenantMetricsReader } from "./persistence/platform-tenant-metrics.reader.js"
import type { WorkspaceCatalogRepository } from "./persistence/workspace-catalog.repository.js"
import { createPlatformTenantsRouter } from "./routes/platform-tenants.routes.js"
import { PlatformTenantsService } from "./services/platform-tenants.service.js"

export type PlatformTenantsModuleDeps = {
  tenant: PlatformTenantRepository
  catalog: WorkspaceCatalogRepository
  metrics: PlatformTenantMetricsReader
  license?: WorkspaceLicenseRepository
}

export function createPlatformTenantsService(
  audit: PlatformAuditService,
  deps: PlatformTenantsModuleDeps,
): PlatformTenantsService {
  if (!deps.license) {
    throw new Error("PlatformTenantsModuleDeps.license is required")
  }
  return new PlatformTenantsService(deps.tenant, deps.catalog, deps.metrics, deps.license, audit)
}

export function mountPlatformTenantsRoutes(
  platformRouter: Router,
  audit: PlatformAuditService,
  deps: PlatformTenantsModuleDeps,
): void {
  const service = createPlatformTenantsService(audit, deps)
  platformRouter.use(createPlatformTenantsRouter(service))
}
