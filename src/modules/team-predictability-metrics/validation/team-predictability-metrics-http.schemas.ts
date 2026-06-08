import { z } from "zod"

const uuid = z.string().uuid()

export const predictabilityTeamParamsSchema = z.object({
  workspacePublicId: uuid,
  teamPublicId: uuid,
})

export const predictabilityWorkspaceParamsSchema = z.object({
  workspacePublicId: uuid,
})

const methodologyQ = z.enum(["scrum", "kanban"]).optional()

export const predictabilitySummaryQuerySchema = z.object({
  projectPublicId: uuid.optional(),
  lastN: z.coerce.number().int().min(1).max(24).optional().default(6),
})

export const predictabilityTrendQuerySchema = z.object({
  projectPublicId: uuid.optional(),
  lastN: z.coerce.number().int().min(1).max(24).optional().default(6),
})

export const listPredictabilityTeamsQuerySchema = z.object({
  projectPublicId: uuid.optional(),
  lastN: z.coerce.number().int().min(1).max(24).optional().default(6),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  methodology: methodologyQ,
})
