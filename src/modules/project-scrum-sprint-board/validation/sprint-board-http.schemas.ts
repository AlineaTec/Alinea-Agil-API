import { z } from "zod"
import { sprintPlanningMountParamsSchema, sprintPlanningSprintParamsSchema } from "../../project-scrum-sprint-planning/validation/sprint-planning-http.schemas.js"

export const sprintBoardMountParamsSchema = sprintPlanningMountParamsSchema
export const sprintBoardSprintParamsSchema = sprintPlanningSprintParamsSchema

export const sprintBoardItemParamsSchema = sprintBoardSprintParamsSchema.extend({
  backlogItemPublicId: z.string().uuid(),
})

const boardColumnSchema = z.enum(["to_do", "in_progress", "in_review", "done"])

export const moveSprintBoardColumnBodySchema = z.object({
  boardColumn: boardColumnSchema,
})
