import { z } from "zod"

export const sprintRetrospectiveSprintParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
  sprintPublicId: z.string().uuid(),
})

/** Bloques de texto; mismos límites que bloques largos de review (MVP). */
export const SPRINT_RETROSPECTIVE_BLOCK_MAX = 8_000

/** Texto por acción de mejora (más corto que un bloque completo). */
export const SPRINT_RETROSPECTIVE_ACTION_ITEM_TEXT_MAX = 4_000

const textField = (max: number) =>
  z
    .string()
    .max(max, `Must be at most ${max} characters.`)

const ownerField = z.union([z.string().uuid(), z.null()]).optional()

export const sprintRetrospectiveActionItemCreateRowSchema = z
  .object({
    text: textField(SPRINT_RETROSPECTIVE_ACTION_ITEM_TEXT_MAX),
    ownerUserPublicId: ownerField,
    status: z.enum(["open", "done"]).optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.text.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Action item text must not be empty after trimming.",
        path: ["text"],
      })
    }
  })

export const sprintRetrospectiveActionItemPatchRowSchema = z
  .object({
    actionItemPublicId: z.string().uuid().optional(),
    text: textField(SPRINT_RETROSPECTIVE_ACTION_ITEM_TEXT_MAX),
    ownerUserPublicId: ownerField,
    status: z.enum(["open", "done"]),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.text.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Action item text must not be empty after trimming.",
        path: ["text"],
      })
    }
  })

export const createSprintRetrospectiveBodySchema = z
  .object({
    wentWell: textField(SPRINT_RETROSPECTIVE_BLOCK_MAX).optional(),
    didNotGoWell: textField(SPRINT_RETROSPECTIVE_BLOCK_MAX).optional(),
    improvements: textField(SPRINT_RETROSPECTIVE_BLOCK_MAX).optional(),
    actionItems: z.array(sprintRetrospectiveActionItemCreateRowSchema).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const wentWell = (data.wentWell ?? "").trim()
    const didNotGoWell = (data.didNotGoWell ?? "").trim()
    const improvements = (data.improvements ?? "").trim()
    const items = data.actionItems ?? []
    const hasStructuredAction = items.some((it) => it.text.trim().length > 0)
    const hasAny =
      wentWell.length > 0 ||
      didNotGoWell.length > 0 ||
      improvements.length > 0 ||
      hasStructuredAction
    if (!hasAny) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide at least one non-empty field (wentWell, didNotGoWell, improvements, or at least one action item with text) after trimming.",
        path: [],
      })
    }
  })

export type CreateSprintRetrospectiveBody = z.infer<typeof createSprintRetrospectiveBodySchema>

export const patchSprintRetrospectiveBodySchema = z
  .object({
    wentWell: textField(SPRINT_RETROSPECTIVE_BLOCK_MAX).optional(),
    didNotGoWell: textField(SPRINT_RETROSPECTIVE_BLOCK_MAX).optional(),
    improvements: textField(SPRINT_RETROSPECTIVE_BLOCK_MAX).optional(),
    actionItems: z.array(sprintRetrospectiveActionItemPatchRowSchema).optional(),
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
    if (data.actionItems) {
      const ids = data.actionItems.map((r) => r.actionItemPublicId).filter(Boolean) as string[]
      const unique = new Set(ids)
      if (unique.size !== ids.length) {
        ctx.addIssue({
          code: "custom",
          message: "actionItemPublicId values must be unique when provided.",
          path: ["actionItems"],
        })
      }
    }
  })

export type PatchSprintRetrospectiveBody = z.infer<typeof patchSprintRetrospectiveBodySchema>
