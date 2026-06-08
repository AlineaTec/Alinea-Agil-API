import type { Router } from "express"
import type { PrismaClient } from "@prisma/client"
import { createPlatformRegistrationPaddleRouter } from "./routes/platform-registration-paddle.routes.js"
import { PlatformRegistrationPaddleReadService } from "./services/platform-registration-paddle-read.service.js"

export function mountPlatformRegistrationPaddleRoutes(
  platformRouter: Router,
  prisma: PrismaClient,
): void {
  const service = new PlatformRegistrationPaddleReadService(prisma)
  platformRouter.use(createPlatformRegistrationPaddleRouter(service))
}
