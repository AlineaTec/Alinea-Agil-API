import { z } from "zod"
import { KANBAN_BOARD_BLOCKED_REASON_MAX_LENGTH } from "../domain/kanban-board.constants.js"
import { kanbanBacklogItemPathParamsSchema, kanbanBacklogMountParamsSchema } from "../../project-kanban-backlog/validation/project-kanban-backlog-http.schemas.js"

export const kanbanBoardMountParamsSchema = kanbanBacklogMountParamsSchema
export const kanbanBoardItemPathParamsSchema = kanbanBacklogItemPathParamsSchema

export const kanbanBoardSnapshotQuerySchema = z
  .object({
    itemsPerColumn: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

export const kanbanBoardColumnItemsPathParamsSchema = kanbanBoardMountParamsSchema.extend({
  columnPublicId: z.string().uuid(),
})

export const kanbanBoardColumnItemsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    afterSortOrder: z.coerce.number().int().optional(),
    afterPublicId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (q) =>
      (q.afterSortOrder === undefined && q.afterPublicId === undefined) ||
      (q.afterSortOrder !== undefined && q.afterPublicId !== undefined),
    { message: "afterSortOrder and afterPublicId must be provided together." },
  )

export const moveKanbanBoardItemBodySchema = z
  .object({
    to_column_public_id: z.string().uuid(),
    allow_wip_override: z.boolean().optional(),
    kanban_wip_move_ack: z.boolean().optional(),
    kanban_wip_override_reason: z.string().min(1).max(2000).optional(),
  })
  .strict()

export const blockKanbanBoardItemBodySchema = z
  .object({
    blocked_reason: z.string().max(KANBAN_BOARD_BLOCKED_REASON_MAX_LENGTH).optional().nullable(),
  })
  .strict()

export const patchBlockedReasonBodySchema = z
  .object({
    blocked_reason: z.string().min(1).max(KANBAN_BOARD_BLOCKED_REASON_MAX_LENGTH),
  })
  .strict()
