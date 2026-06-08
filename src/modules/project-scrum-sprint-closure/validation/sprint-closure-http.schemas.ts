import { z } from "zod"

export const sprintClosureSprintParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
  sprintPublicId: z.string().uuid(),
})

export const closeSprintBodySchema = z.object({
  closureNote: z.string().min(1, "closureNote is required"),
  goalAchieved: z.boolean(),
  /** Obligatorio en servicio si hay ítems `not_completed` en el snapshot. */
  confirmIncompleteWork: z.boolean().optional(),
})

export type CloseSprintBody = z.infer<typeof closeSprintBodySchema>
