import { z } from "zod"

export const flowTimeMountParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const flowTimeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  timeZone: z.string().min(1).max(64).optional(),
  includeItemDetails: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
})

export type FlowTimeQueryDto = z.infer<typeof flowTimeQuerySchema>
