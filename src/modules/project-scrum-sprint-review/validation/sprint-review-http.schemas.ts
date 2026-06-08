import { z } from "zod"

export const sprintReviewSprintParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
  sprintPublicId: z.string().uuid(),
})

/** Límites conservadores (MVP). */
export const SPRINT_REVIEW_SUMMARY_MAX = 4_000
export const SPRINT_REVIEW_TEXT_BLOCK_MAX = 8_000

const textField = (max: number) =>
  z
    .string()
    .max(max, `Must be at most ${max} characters.`)

export const createSprintReviewBodySchema = z
  .object({
    summary: textField(SPRINT_REVIEW_SUMMARY_MAX).optional(),
    incrementReviewNotes: textField(SPRINT_REVIEW_TEXT_BLOCK_MAX).optional(),
    decisions: textField(SPRINT_REVIEW_TEXT_BLOCK_MAX).optional(),
    nextSteps: textField(SPRINT_REVIEW_TEXT_BLOCK_MAX).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const summary = (data.summary ?? "").trim()
    const incrementReviewNotes = (data.incrementReviewNotes ?? "").trim()
    const decisions = (data.decisions ?? "").trim()
    const nextSteps = (data.nextSteps ?? "").trim()
    const hasAny =
      summary.length > 0 ||
      incrementReviewNotes.length > 0 ||
      decisions.length > 0 ||
      nextSteps.length > 0
    if (!hasAny) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide at least one non-empty field (summary, incrementReviewNotes, decisions, or nextSteps) after trimming.",
        path: [],
      })
    }
  })

export type CreateSprintReviewBody = z.infer<typeof createSprintReviewBodySchema>

export const patchSprintReviewBodySchema = z
  .object({
    summary: textField(SPRINT_REVIEW_SUMMARY_MAX).optional(),
    incrementReviewNotes: textField(SPRINT_REVIEW_TEXT_BLOCK_MAX).optional(),
    decisions: textField(SPRINT_REVIEW_TEXT_BLOCK_MAX).optional(),
    nextSteps: textField(SPRINT_REVIEW_TEXT_BLOCK_MAX).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const keys = Object.keys(data) as (keyof typeof data)[]
    if (keys.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Provide at least one field to update.",
        path: [],
      })
    }
  })

export type PatchSprintReviewBody = z.infer<typeof patchSprintReviewBodySchema>
