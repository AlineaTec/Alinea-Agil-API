import type { Express } from "express"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkActivityNotificationQueryService } from "./services/work-activity-notification-query.service.js"
import { createWorkActivityNotificationsRouter } from "./routes/work-activity-notifications.routes.js"

export type MountWorkActivityNotificationsModuleOptions = {
  queryService: WorkActivityNotificationQueryService
  authBearerService: AuthBearerService
}

/**
 * Rutas bajo `/v1/me/notifications` (sesión web autenticada por Bearer).
 */
export function mountWorkActivityNotificationsModule(
  app: Express,
  options: MountWorkActivityNotificationsModuleOptions,
): void {
  app.use(
    "/v1/me/notifications",
    createWorkActivityNotificationsRouter(options.queryService, options.authBearerService),
  )
}
