import { z } from "zod"

export const platformTenantIdParamsSchema = z.object({
  platformTenantId: z.string().uuid(),
})

export const workspacePublicIdParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})
