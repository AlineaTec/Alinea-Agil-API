import { z } from "zod"

export const sprintMetricsSprintParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
  sprintPublicId: z.string().uuid(),
})
