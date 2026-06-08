import { z } from "zod"

const uuid = z.string().uuid()

const platformAuditCategorySchema = z.enum([
  "platform_identity",
  "platform_tenant",
  "platform_operations",
  "platform_licensing",
])

export const platformAuditListQuerySchema = z.object({
  platformTenantId: uuid.optional(),
  workspacePublicId: uuid.optional(),
  actorPlatformUserId: uuid.optional(),
  category: platformAuditCategorySchema.optional(),
  action: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export const platformAuditExportQuerySchema = platformAuditListQuerySchema.extend({
  format: z.enum(["csv", "json"]).optional().default("csv"),
})

export const platformAuditEventIdParamsSchema = z.object({
  platformAuditEventId: uuid,
})
