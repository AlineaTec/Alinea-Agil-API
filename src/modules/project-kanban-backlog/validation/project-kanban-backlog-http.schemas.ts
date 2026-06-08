import { z } from "zod"
import { ACCEPTANCE_CRITERION_STATUSES } from "../../project-scrum-backlog/domain/acceptance-criterion-status.js"
import { SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS } from "../../project-scrum-backlog/domain/backlog-item-priority-level.js"
import { SCRUM_BACKLOG_ITEM_STATUSES } from "../../project-scrum-backlog/domain/backlog-item-status.js"
import { SCRUM_BACKLOG_ACCEPTANCE_CRITERIA_MAX } from "../../project-scrum-backlog/domain/scrum-backlog-acceptance-criteria.validation.js"
import { SCRUM_BACKLOG_STORY_POINTS_MAX } from "../../project-scrum-backlog/domain/scrum-backlog-operational-fields.policy.js"
import { scrumBacklogItemPathParamsSchema, scrumBacklogMountParamsSchema } from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"

export const kanbanBacklogMountParamsSchema = scrumBacklogMountParamsSchema
export const kanbanBacklogItemPathParamsSchema = scrumBacklogItemPathParamsSchema

const KANBAN_CREATE_ITEM_TYPES = ["epic", "user_story", "task", "bug"] as const

const acceptanceCriterionInputSchema = z
  .object({
    acceptanceCriterionPublicId: z.string().uuid().optional().nullable(),
    text: z.string().min(1).max(4000),
    status: z.enum(ACCEPTANCE_CRITERION_STATUSES),
  })
  .strict()

const acceptanceCriteriaInputSchema = z
  .array(acceptanceCriterionInputSchema)
  .max(SCRUM_BACKLOG_ACCEPTANCE_CRITERIA_MAX)

const storyPointsSchema = z
  .union([
    z
      .number()
      .int()
      .min(0)
      .max(SCRUM_BACKLOG_STORY_POINTS_MAX),
    z.null(),
  ])
  .describe("Story points; null = not estimated.")

export const listKanbanBacklogQuerySchema = z
  .object({
    q: z.string().max(500).optional(),
    unassigned: z.enum(["true", "false"]).optional(),
    assignee: z.enum(["me"]).optional(),
    assigneeUserPublicId: z.string().uuid().optional(),
  })
  .strict()

export const createKanbanBacklogItemBodySchema = z
  .object({
    itemType: z.enum(KANBAN_CREATE_ITEM_TYPES),
    title: z.string().min(1).max(500),
    description: z.string().max(8000).optional().default(""),
    status: z.enum(SCRUM_BACKLOG_ITEM_STATUSES).optional(),
    storyPoints: storyPointsSchema.optional(),
    priorityLevel: z.enum(SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS).optional(),
    acceptanceCriteria: acceptanceCriteriaInputSchema.optional(),
  })
  .strict()

export const patchKanbanBacklogItemBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(8000).optional(),
    status: z.enum(SCRUM_BACKLOG_ITEM_STATUSES).optional(),
    storyPoints: storyPointsSchema.optional(),
    priorityLevel: z.enum(SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS).optional(),
    acceptanceCriteria: acceptanceCriteriaInputSchema.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required." })

export const reorderKanbanBacklogBodySchema = z
  .object({
    orderedBacklogItemPublicIds: z.array(z.string().uuid()).min(1),
  })
  .strict()

export const releaseToFlowBodySchema = z
  .object({
    allow_wip_override: z.boolean().optional(),
    kanban_wip_move_ack: z.boolean().optional(),
    kanban_wip_override_reason: z.string().min(1).max(2000).optional(),
  })
  .strict()
