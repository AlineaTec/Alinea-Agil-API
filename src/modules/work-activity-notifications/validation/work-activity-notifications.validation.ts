import { z } from "zod"

const uuid = z.string().uuid()

export const listWorkActivityNotificationsQuerySchema = z.object({
  workspacePublicId: uuid.optional(),
  scope: z.enum(["all", "mine", "following", "unread"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  daysWindow: z.coerce.number().int().min(1).max(90).optional().default(30),
  cursor: z.string().min(1).optional(),
})

export const unreadWorkActivityNotificationsQuerySchema = z.object({
  workspacePublicId: uuid.optional(),
  daysWindow: z.coerce.number().int().min(1).max(90).optional().default(30),
})

export const markAllWorkActivityNotificationsReadBodySchema = z.object({
  workspacePublicId: uuid.optional(),
  daysWindow: z.coerce.number().int().min(1).max(90).optional().default(30),
})

export const notificationPublicIdParamSchema = z.object({
  notificationPublicId: uuid,
})
