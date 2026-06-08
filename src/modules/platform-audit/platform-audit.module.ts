import type { Router } from "express"
import type { PlatformAuditQueryRepository } from "./persistence/platform-audit-query.repository.js"
import { createPlatformAuditRouter } from "./routes/platform-audit.routes.js"
import { PlatformAuditReadService } from "./services/platform-audit-read.service.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"

export function createPlatformAuditReadService(
  query: PlatformAuditQueryRepository,
): PlatformAuditReadService {
  return new PlatformAuditReadService(query)
}

export function mountPlatformAuditRoutes(
  platformRouter: Router,
  query: PlatformAuditQueryRepository,
): void {
  const service = createPlatformAuditReadService(
    requireInjected(query, "platformAuditQuery"),
  )
  platformRouter.use(createPlatformAuditRouter(service))
}
