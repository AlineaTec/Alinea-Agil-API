import { z } from "zod"

const uuid = z.string().uuid()

export const platformObservabilityTenantListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  /** Si true, solo tenants con salud distinta de `normal`. */
  attentionOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
})

export const platformTenantIdParamsSchema = z.object({
  platformTenantId: uuid,
})
