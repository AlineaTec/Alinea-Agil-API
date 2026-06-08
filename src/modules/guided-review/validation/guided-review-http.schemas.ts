import { z } from "zod"
import {
  GUIDED_REVIEW_MAX_LIST_ITEMS,
  GUIDED_REVIEW_MAX_LIST_STRING,
  GUIDED_REVIEW_MAX_TEXT_FIELD,
  GUIDED_REVIEW_MAX_TRANSCRIPT_AFTER_CLOSE,
  GUIDED_REVIEW_MAX_WORK_ITEM_LINKS_PER_FEEDBACK,
} from "../domain/guided-review-limits.js"

export const guidedReviewProjectParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const guidedReviewTodayQuerySchema = z.object({
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sessionSlot: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .optional(),
})

export const guidedReviewSessionHeaderBodySchema = z.object({
  reviewGoalSummary: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  reviewMode: z.enum(["live", "async"]).optional(),
  facilitatorUserPublicId: z.string().uuid().nullable().optional(),
  productOwnerUserPublicId: z.string().uuid().nullable().optional(),
  sprintPublicId: z.string().uuid().nullable().optional(),
})

export const guidedReviewDemonstratedItemBodySchema = z.object({
  demonstrationStatus: z.enum([
    "not_demonstrated",
    "demonstrated",
    "demonstrated_partial",
    "demonstrated_with_observations",
    "skipped",
  ]),
  demonstratedByUserPublicIds: z.array(z.string().uuid()).max(200).optional(),
  demoNotes: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  stakeholderFeedbackSummary: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  questionsRaised: z.array(z.string().max(GUIDED_REVIEW_MAX_LIST_STRING)).max(GUIDED_REVIEW_MAX_LIST_ITEMS).optional(),
  followUpRequired: z.boolean().optional(),
  backlogImpactSuggested: z.boolean().optional(),
  priorityImpactSuggested: z.boolean().optional(),
  requiresFurtherValidation: z.boolean().optional(),
  reviewOutcome: z
    .enum([
      "no_major_issues",
      "observations_recorded",
      "follow_up_required",
      "backlog_or_priority_impact",
      "needs_external_validation",
    ])
    .nullable()
    .optional(),
})

export const guidedReviewFeedbackBodySchema = z.object({
  sourceType: z.enum(["stakeholder", "product_owner", "team", "facilitator", "other"]),
  stakeholderDisplayName: z.string().max(500).nullable().optional(),
  feedbackText: z.string().min(1).max(GUIDED_REVIEW_MAX_TEXT_FIELD),
  feedbackCategory: z.enum([
    "value_and_outcome",
    "usability_and_experience",
    "scope_and_clarity",
    "quality_and_risk",
    "sprint_goal_alignment",
    "process_and_facilitation",
    "other",
  ]),
  affectsWorkItemPublicIds: z.array(z.string().uuid()).max(GUIDED_REVIEW_MAX_WORK_ITEM_LINKS_PER_FEEDBACK).optional(),
  suggestedBacklogAction: z.string().max(GUIDED_REVIEW_MAX_LIST_STRING).nullable().optional(),
  suggestedPriorityImpact: z.string().max(GUIDED_REVIEW_MAX_LIST_STRING).nullable().optional(),
  marksFollowUp: z.boolean().optional(),
  marksBacklogImpact: z.boolean().optional(),
  marksPriorityImpact: z.boolean().optional(),
})

export const guidedReviewCloseBodySchema = z.object({
  generalSummary: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  agreements: z.array(z.string().max(GUIDED_REVIEW_MAX_LIST_STRING)).max(GUIDED_REVIEW_MAX_LIST_ITEMS),
  followUps: z.array(z.string().max(GUIDED_REVIEW_MAX_LIST_STRING)).max(GUIDED_REVIEW_MAX_LIST_ITEMS),
  stakeholderSummary: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  openQuestionsRemaining: z
    .array(z.string().max(GUIDED_REVIEW_MAX_LIST_STRING))
    .max(GUIDED_REVIEW_MAX_LIST_ITEMS)
    .optional(),
  methodologicalNotes: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  incrementAssessment: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
  sprintGoalAssessment: z
    .enum(["achieved", "partially_achieved", "compromised", "unclear", "not_applicable"])
    .nullable()
    .optional(),
  sprintGoalAssessmentExplanation: z.string().max(GUIDED_REVIEW_MAX_TEXT_FIELD).nullable().optional(),
})

export const guidedReviewAdditiveNoteBodySchema = z.object({
  note: z.string().min(1).max(GUIDED_REVIEW_MAX_TEXT_FIELD),
})

export const guidedReviewTranscriptAfterCloseBodySchema = z.object({
  transcript: z.string().max(GUIDED_REVIEW_MAX_TRANSCRIPT_AFTER_CLOSE),
})

export const guidedReviewRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const guidedReviewWorkItemParamsSchema = guidedReviewProjectParamsSchema.extend({
  workItemPublicId: z.string().uuid(),
})
