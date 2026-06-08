import type { Router } from "express"
import type { PlatformTenantsModuleDeps } from "../platform-tenants/platform-tenants.module.js"
import { createPlatformLicensingRouter } from "./routes/platform-licensing.routes.js"
import { PlatformLicensingService } from "./services/platform-licensing.service.js"

export function createPlatformLicensingService(deps: PlatformTenantsModuleDeps): PlatformLicensingService {
  if (!deps.license) {
    throw new Error("PlatformTenantsModuleDeps.license is required for platform licensing")
  }
  return new PlatformLicensingService(deps.tenant, deps.license, deps.catalog)
}

export function mountPlatformLicensingRoutes(platformRouter: Router, deps: PlatformTenantsModuleDeps): void {
  const service = createPlatformLicensingService(deps)
  platformRouter.use(createPlatformLicensingRouter(service))
}
