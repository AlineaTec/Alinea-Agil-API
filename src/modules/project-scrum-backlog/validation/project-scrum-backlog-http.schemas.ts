import { z } from "zod"
import { ACCEPTANCE_CRITERION_STATUSES } from "../domain/acceptance-criterion-status.js"
import { SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS } from "../domain/backlog-item-priority-level.js"
import { SCRUM_BACKLOG_ITEM_STATUSES } from "../domain/backlog-item-status.js"
import { SCRUM_BACKLOG_ITEM_TYPES } from "../domain/backlog-item-type.js"
import { SCRUM_BACKLOG_ACCEPTANCE_CRITERIA_MAX } from "../domain/scrum-backlog-acceptance-criteria.validation.js"
import { SCRUM_BACKLOG_STORY_POINTS_MAX } from "../domain/scrum-backlog-operational-fields.policy.js"

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

export const scrumBacklogMountParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
    projectPublicId: z
      .string()
      .min(1)
      .max(320)
      .refine((id) => id !== "drafts", { message: "projectPublicId cannot be reserved segment `drafts`." })
      .refine((id) => id !== "runtime", { message: "projectPublicId cannot be reserved segment `runtime`." }),
  })
  .strict()

export const scrumBacklogItemPathParamsSchema = scrumBacklogMountParamsSchema.extend({
  backlogItemPublicId: z.string().uuid(),
})

/** Misma semántica que `backlogItemPublicId` (work item en Scrum/Kanban). */
export const projectWorkItemAssignmentPathParamsSchema = scrumBacklogMountParamsSchema.extend({
  workItemPublicId: z.string().uuid(),
})

export const scrumBacklogItemsListQuerySchema = z
  .object({
    unassigned: z.enum(["true", "false"]).optional(),
    assignee: z.enum(["me"]).optional(),
    assigneeUserPublicId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

const itemTypeSchema = z.enum(SCRUM_BACKLOG_ITEM_TYPES)
const statusSchema = z.enum(SCRUM_BACKLOG_ITEM_STATUSES)
const priorityLevelSchema = z.enum(SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS)
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

export const createScrumBacklogItemBodySchema = z
  .object({
    itemType: itemTypeSchema,
    title: z.string().min(1).max(500),
    description: z.string().max(8000).optional().default(""),
    parentItemPublicId: z.string().uuid().nullable().optional(),
    status: statusSchema.optional(),
    sortOrder: z.number().int().optional(),
    storyPoints: storyPointsSchema.optional(),
    priorityLevel: priorityLevelSchema.optional(),
    acceptanceCriteria: acceptanceCriteriaInputSchema.optional(),
  })
  .strict()

export const patchScrumBacklogItemBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(8000).optional(),
    status: statusSchema.optional(),
    sortOrder: z.number().int().optional(),
    parentItemPublicId: z.string().uuid().nullable().optional(),
    storyPoints: storyPointsSchema.optional(),
    priorityLevel: priorityLevelSchema.optional(),
    acceptanceCriteria: acceptanceCriteriaInputSchema.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required." })

export const moveScrumBacklogItemBodySchema = z
  .object({
    direction: z.enum(["up", "down"]),
  })
  .strict()
