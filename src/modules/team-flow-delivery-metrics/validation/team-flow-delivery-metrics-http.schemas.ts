import { z } from "zod"

const uuid = z.string().uuid()

export const teamFlowMetricsMountParamsSchema = z.object({
  workspacePublicId: uuid,
  teamPublicId: uuid,
})

export const teamFlowMetricsWorkspaceParamsSchema = z.object({
  workspacePublicId: uuid,
})

const isoDate = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), "invalid_iso_date")

export const teamFlowMetricsSummaryQuerySchema = z
  .object({
    projectPublicId: uuid.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((q) => (q.from && q.to) || (!q.from && !q.to), { message: "from_and_to_both_or_neither" })
  .refine(
    (q) => {
      if (!q.from || !q.to) return true
      return new Date(q.from).getTime() <= new Date(q.to).getTime()
    },
    { message: "from_before_to" },
  )

const methodologyQ = z.enum(["scrum", "kanban"]).optional()

export const workspaceFlowTeamsQuerySchema = z
  .object({
    projectPublicId: uuid.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
    includeArchived: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => v === "true"),
    methodology: methodologyQ,
  })
  .refine((q) => (q.from && q.to) || (!q.from && !q.to), { message: "from_and_to_both_or_neither" })
  .refine(
    (q) => {
      if (!q.from || !q.to) return true
      return new Date(q.from).getTime() <= new Date(q.to).getTime()
    },
    { message: "from_before_to" },
  )
