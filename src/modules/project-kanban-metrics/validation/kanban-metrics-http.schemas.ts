import { z } from "zod"

export const kanbanMetricsMountParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const kanbanMetricsThroughputQuerySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
})
