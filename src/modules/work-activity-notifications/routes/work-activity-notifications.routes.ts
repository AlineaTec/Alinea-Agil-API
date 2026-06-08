import { Router, type NextFunction, type Request, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { requireBearerAuth } from "../../login-session/middleware/require-bearer-auth.middleware.js"
import {
  WorkActivityNotificationNotFoundError,
  WorkActivityNotificationValidationError,
} from "../domain/work-activity-notification.errors.js"
import type { WorkActivityNotificationQueryService } from "../services/work-activity-notification-query.service.js"
import {
  listWorkActivityNotificationsQuerySchema,
  markAllWorkActivityNotificationsReadBodySchema,
  notificationPublicIdParamSchema,
  unreadWorkActivityNotificationsQuerySchema,
} from "../validation/work-activity-notifications.validation.js"

function getUserPublicId(res: Response): string {
  const ctx = res.locals.authContext as { session?: { userPublicId?: string } } | undefined
  const id = ctx?.session?.userPublicId
  if (!id) {
    throw new Error("auth_context_missing")
  }
  return id
}

function respondNotificationErrors(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkActivityNotificationNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkActivityNotificationValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "auth_context_missing") {
    res.status(500).json({ error: "internal_error", message: "Auth context missing." })
    return
  }
  next(err)
}

export function createWorkActivityNotificationsRouter(
  queryService: WorkActivityNotificationQueryService,
  authBearerService: AuthBearerService,
): Router {
  const router = Router()
  router.use(requireBearerAuth(authBearerService))

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listWorkActivityNotificationsQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_query", issues: parsed.error.flatten() })
        return
      }
      const recipientUserPublicId = getUserPublicId(res)
      const { items, nextCursor } = await queryService.listForUser({
        recipientUserPublicId,
        workspacePublicId: parsed.data.workspacePublicId,
        scope: parsed.data.scope,
        limit: parsed.data.limit,
        daysWindow: parsed.data.daysWindow,
        cursorRaw: parsed.data.cursor,
      })
      res.status(200).json({
        items,
        nextCursor,
      })
    } catch (err) {
      respondNotificationErrors(err, res, next)
    }
  })

  router.get("/unread-count", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = unreadWorkActivityNotificationsQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_query", issues: parsed.error.flatten() })
        return
      }
      const recipientUserPublicId = getUserPublicId(res)
      const { count } = await queryService.unreadCountForUser({
        recipientUserPublicId,
        workspacePublicId: parsed.data.workspacePublicId,
        daysWindow: parsed.data.daysWindow,
      })
      res.status(200).json({ count })
    } catch (err) {
      respondNotificationErrors(err, res, next)
    }
  })

  router.get("/:notificationPublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = notificationPublicIdParamSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const recipientUserPublicId = getUserPublicId(res)
      const row = await queryService.getOneForUser({
        recipientUserPublicId,
        notificationPublicId: parsed.data.notificationPublicId,
      })
      res.status(200).json(row)
    } catch (err) {
      respondNotificationErrors(err, res, next)
    }
  })

  router.patch("/:notificationPublicId/read", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = notificationPublicIdParamSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const recipientUserPublicId = getUserPublicId(res)
      await queryService.markOneRead({
        recipientUserPublicId,
        notificationPublicId: parsed.data.notificationPublicId,
      })
      res.status(204).send()
    } catch (err) {
      respondNotificationErrors(err, res, next)
    }
  })

  router.post("/mark-all-read", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = markAllWorkActivityNotificationsReadBodySchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_body", issues: parsed.error.flatten() })
        return
      }
      const recipientUserPublicId = getUserPublicId(res)
      const { updated } = await queryService.markAllRead({
        recipientUserPublicId,
        workspacePublicId: parsed.data.workspacePublicId,
        daysWindow: parsed.data.daysWindow,
      })
      res.status(200).json({ updated })
    } catch (err) {
      respondNotificationErrors(err, res, next)
    }
  })

  return router
}
