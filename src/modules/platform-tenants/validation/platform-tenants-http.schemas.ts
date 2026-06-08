import { z } from "zod"
import { PLATFORM_TENANT_STATUSES } from "../domain/platform-tenant-status.js"

export const platformTenantListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export const platformTenantIdParamsSchema = z.object({
  platformTenantId: z.string().uuid(),
})

export const workspacePublicIdParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const platformTenantPatchStatusSchema = z.object({
  status: z.enum(PLATFORM_TENANT_STATUSES),
})
