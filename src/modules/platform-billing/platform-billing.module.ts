import type { Router } from "express"
import type { PlatformAuditService } from "../platform-users/services/platform-audit.service.js"
import type { WorkspaceLicenseRepository } from "../workspace-licenses/persistence/workspace-license.repository.js"
import type { PlatformTenantRepository } from "../platform-tenants/persistence/platform-tenant.repository.js"
import type { WorkspaceCatalogRepository } from "../platform-tenants/persistence/workspace-catalog.repository.js"
import { createPlatformBillingRouter } from "./routes/platform-billing.routes.js"
import { PlatformBillingService } from "./services/platform-billing.service.js"

export type PlatformBillingDeps = {
  catalog: WorkspaceCatalogRepository
  tenant: PlatformTenantRepository
  license: WorkspaceLicenseRepository
}

export function createPlatformBillingService(
  _audit: PlatformAuditService,
  deps: PlatformBillingDeps,
): PlatformBillingService {
  return new PlatformBillingService(deps.catalog, deps.tenant, deps.license)
}

export function mountPlatformBillingRoutes(
  platformRouter: Router,
  audit: PlatformAuditService,
  deps: PlatformBillingDeps,
): void {
  const service = createPlatformBillingService(audit, deps)
  platformRouter.use(createPlatformBillingRouter(service))
}
