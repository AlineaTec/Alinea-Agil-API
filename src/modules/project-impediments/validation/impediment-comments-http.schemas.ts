import { z } from "zod"
import { impedimentPathParamsSchema } from "./impediment-http.schemas.js"

export const IMPEDIMENT_COMMENT_BODY_MAX = 4000

export const impedimentCommentPathParamsSchema = impedimentPathParamsSchema.extend({
  commentPublicId: z.string().uuid(),
})

const cursorSchema = z
  .string()
  .min(1)
  .optional()
  .transform((v) => v ?? undefined)

export const listProjectImpedimentCommentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: cursorSchema,
  })
  .strict()

export const createProjectImpedimentCommentBodySchema = z
  .object({
    body: z.string().min(1).max(IMPEDIMENT_COMMENT_BODY_MAX),
  })
  .strict()

export const patchProjectImpedimentCommentBodySchema = z
  .object({
    body: z.string().min(1).max(IMPEDIMENT_COMMENT_BODY_MAX),
  })
  .strict()
