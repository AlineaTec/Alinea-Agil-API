import type { Router } from "express"
import type { PrismaClient } from "@prisma/client"
import { createPlatformIdentityRegistrationIntentsRouter } from "./routes/platform-registration-intents.routes.js"
import type { PlatformAuditService } from "../platform-users/services/platform-audit.service.js"
import { PlatformIdentityRegistrationIntentsAdminService } from "./services/platform-registration-intents-admin.service.js"

export function mountPlatformIdentityRegistrationIntentsRoutes(
  platformRouter: Router,
  platformAudit: PlatformAuditService,
  prisma: PrismaClient,
): void {
  const service = new PlatformIdentityRegistrationIntentsAdminService(prisma, platformAudit)
  platformRouter.use(createPlatformIdentityRegistrationIntentsRouter(service))
}
