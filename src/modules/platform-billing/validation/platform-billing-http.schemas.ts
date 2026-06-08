import { z } from "zod"

export const platformBillingTenantListQuerySchema = z.object({
  q: z.string().optional(),
  sort: z
    .enum(["equivalent_monthly_desc", "equivalent_monthly_asc", "name_asc", "code_asc"])
    .optional()
    .default("equivalent_monthly_desc"),
})

export type PlatformBillingTenantListQuery = z.infer<typeof platformBillingTenantListQuerySchema>

export const platformBillingTenantIdParamsSchema = z.object({
  platformTenantId: z.string().uuid(),
})
