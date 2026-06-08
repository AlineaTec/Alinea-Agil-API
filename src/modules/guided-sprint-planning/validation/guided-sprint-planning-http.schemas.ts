import { z } from "zod"
import { BUFFER_MODES, CAPACITY_UNITS } from "../domain/guided-sprint-planning-session.js"
import { GUIDED_SPRINT_PLANNING_MAX_TRANSCRIPT_AFTER_CLOSE } from "../domain/guided-sprint-planning-limits.js"
import { CAPACITY_CONCERNS, EXCLUDED_REASONS } from "../domain/guided-sprint-planning-candidate-item.js"

export const guidedSprintPlanningProjectParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const guidedSprintPlanningSprintParamsSchema = guidedSprintPlanningProjectParamsSchema.extend({
  sprintPublicId: z.string().uuid(),
})

export const guidedSprintPlanningWorkItemParamsSchema = guidedSprintPlanningProjectParamsSchema.extend({
  workItemPublicId: z.string().uuid(),
})

export const guidedSprintPlanningCurrentQuerySchema = z.object({
  sprintPublicId: z.string().uuid().optional(),
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sessionSlot: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .optional(),
})

export const guidedSprintPlanningRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const optionalText = z.string().max(8000).nullable().optional()

export const guidedSprintPlanningSessionHeaderBodySchema = z.object({
  planningGoalDraft: optionalText,
  facilitatorUserPublicId: z.string().uuid().nullable().optional(),
  productOwnerUserPublicId: z.string().uuid().nullable().optional(),
  capacityTotal: z.number().min(0).nullable().optional(),
  capacityUnit: z.enum(CAPACITY_UNITS).nullable().optional(),
  bufferReserved: z.number().min(0).nullable().optional(),
  bufferMode: z.enum(BUFFER_MODES).nullable().optional(),
  sprintPublicId: z.string().uuid().optional(),
})

export const guidedSprintPlanningCandidateSyncBodySchema = z.object({
  mode: z.enum(["ready_from_refinement", "all_open_backlog"]).optional(),
})

export const guidedSprintPlanningCandidateDecisionBodySchema = z.object({
  isCommitted: z.boolean().optional(),
  isExcluded: z.boolean().optional(),
  excludedReason: z.enum(EXCLUDED_REASONS).nullable().optional(),
  excludedReasonNotes: optionalText,
  riskNotes: optionalText,
  dependencyNotes: optionalText,
  capacityConcern: z.enum(CAPACITY_CONCERNS).optional(),
  planningDecisionNotes: optionalText,
})

export const guidedSprintPlanningCloseBodySchema = z.object({
  sprintGoalFinal: optionalText,
  summary: z.string().max(8000),
  agreements: z.array(z.string().max(2000)).max(100),
  followUps: z.array(z.string().max(2000)).max(100),
  transcript: z.string().max(GUIDED_SPRINT_PLANNING_MAX_TRANSCRIPT_AFTER_CLOSE).optional(),
})

export const guidedSprintPlanningTranscriptAfterCloseBodySchema = z.object({
  transcript: z.string().max(GUIDED_SPRINT_PLANNING_MAX_TRANSCRIPT_AFTER_CLOSE),
})

export const guidedSprintPlanningAdditiveNoteBodySchema = z.object({
  note: z.string().min(1).max(4000),
})

export const guidedSprintPlanningManualCandidateBodySchema = z.object({
  workItemPublicIds: z.array(z.string().uuid()).min(1).max(200),
})
