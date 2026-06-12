import { z } from "zod"

export const roadmapMountParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
    projectPublicId: z.string().uuid(),
  })
  .strict()

export const roadmapSummaryQuerySchema = z
  .object({
    window: z.string().min(1).max(16).optional(),
    cycleActive: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
  })
  .strict()
