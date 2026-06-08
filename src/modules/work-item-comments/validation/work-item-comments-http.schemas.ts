import { z } from "zod"
import { scrumBacklogItemPathParamsSchema } from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"

export const WORK_ITEM_COMMENT_BODY_MAX = 4000

export const workItemCommentPathParamsSchema = scrumBacklogItemPathParamsSchema.extend({
  commentPublicId: z.string().uuid(),
})

const cursorSchema = z
  .string()
  .min(1)
  .optional()
  .transform((v) => v ?? undefined)

export const listWorkItemCommentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: cursorSchema,
  })
  .strict()

export const createWorkItemCommentBodySchema = z
  .object({
    body: z.string().min(1).max(WORK_ITEM_COMMENT_BODY_MAX),
  })
  .strict()

export const patchWorkItemCommentBodySchema = z
  .object({
    body: z.string().min(1).max(WORK_ITEM_COMMENT_BODY_MAX),
  })
  .strict()
