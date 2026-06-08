import { z } from "zod"

export const platformBillingWorkspaceIdParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const platformBillingWorkspacesListQuerySchema = z.object({
  q: z.string().optional(),
  statusGroup: z.enum(["all", "active", "grace", "suspended"]).optional().default("all"),
  billingSource: z.enum(["all", "paddle", "manual"]).optional().default("all"),
  onlyOverCapacity: z.coerce.boolean().optional(),
  onlyAttention: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  offset: z.coerce.number().min(0).optional().default(0),
})

export type PlatformBillingWorkspacesListQuery = z.infer<typeof platformBillingWorkspacesListQuerySchema>
