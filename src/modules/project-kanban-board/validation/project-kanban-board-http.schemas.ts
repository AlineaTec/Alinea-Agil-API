import { z } from "zod"
import { KANBAN_BOARD_BLOCKED_REASON_MAX_LENGTH } from "../domain/kanban-board.constants.js"
import { kanbanBacklogItemPathParamsSchema, kanbanBacklogMountParamsSchema } from "../../project-kanban-backlog/validation/project-kanban-backlog-http.schemas.js"

export const kanbanBoardMountParamsSchema = kanbanBacklogMountParamsSchema
export const kanbanBoardItemPathParamsSchema = kanbanBacklogItemPathParamsSchema

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
