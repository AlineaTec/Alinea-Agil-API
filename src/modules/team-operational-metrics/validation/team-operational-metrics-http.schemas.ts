import { z } from "zod"

const uuid = z.string().uuid()

export const teamOperationalMetricsMountParamsSchema = z.object({
  workspacePublicId: uuid,
  teamPublicId: uuid,
})

export const teamOperationalMetricsWorkspaceParamsSchema = z.object({
  workspacePublicId: uuid,
})

export const teamMetricsSummaryQuerySchema = z.object({
  projectPublicId: uuid.optional(),
})

export const teamMetricsMembersQuerySchema = z.object({
  projectPublicId: uuid.optional(),
})

export const workspaceTeamsMetricsQuerySchema = z.object({
  projectPublicId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
})
