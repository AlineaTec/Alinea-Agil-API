import { z } from "zod"
import { SPRINT_BOARD_COLUMNS } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"

const uuid = z.string().uuid()

export const boardItemParamsSchema = z.object({
  workspacePublicId: uuid,
  projectPublicId: uuid,
  workItemPublicId: uuid,
})

const sprintColumnId = z.enum(SPRINT_BOARD_COLUMNS)

/**
 * `from_column_public_id` / `to_column_public_id` en Scrum son los **identificadores estables** de columna
 * (`to_do`, `in_progress`, …), no labels de UI.
 */
export const boardItemMoveBodySchema = z
  .object({
    sprint_public_id: z.string().uuid().optional(),
    from_column_public_id: z.string().min(1),
    to_column_public_id: z.string().min(1),
    allow_wip_override: z.boolean().optional(),
    kanban_wip_move_ack: z.boolean().optional(),
    kanban_wip_override_reason: z.string().min(1).max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    const isScrumFrom = sprintColumnId.safeParse(val.from_column_public_id).success
    const isScrumTo = sprintColumnId.safeParse(val.to_column_public_id).success
    if (isScrumFrom !== isScrumTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from_column_public_id and to_column_public_id must both be sprint board column ids or both be Kanban column public ids (UUID).",
      })
    }
  })

export const boardItemReorderBodySchema = z
  .object({
    sprint_public_id: z.string().uuid().optional(),
    /** Scrum: columna del sprint board. Kanban: UUID de columna. */
    column_public_id: z.string().min(1),
    /** `null` = al final de la columna. */
    placed_before_backlog_item_public_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const isScrumCol = sprintColumnId.safeParse(val.column_public_id).success
    if (!isScrumCol && !uuid.safeParse(val.column_public_id).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "column_public_id must be a sprint board column id or a Kanban column UUID.",
      })
    }
  })
