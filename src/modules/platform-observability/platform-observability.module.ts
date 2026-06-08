import type { Router } from "express"
import type { PlatformTenantsModuleDeps } from "../platform-tenants/platform-tenants.module.js"
import { createPlatformObservabilityRouter } from "./routes/platform-observability.routes.js"
import { PlatformObservabilityService } from "./services/platform-observability.service.js"

export function createPlatformObservabilityService(deps: PlatformTenantsModuleDeps): PlatformObservabilityService {
  if (!deps.license) {
    throw new Error("PlatformTenantsModuleDeps.license is required for platform observability")
  }
  return new PlatformObservabilityService(deps.tenant, deps.catalog, deps.metrics, deps.license)
}

export function mountPlatformObservabilityRoutes(platformRouter: Router, deps: PlatformTenantsModuleDeps): void {
  const service = createPlatformObservabilityService(deps)
  platformRouter.use(createPlatformObservabilityRouter(service))
}
