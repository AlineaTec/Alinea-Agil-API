import { z } from "zod"

export const guidedRefinementProjectParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const guidedRefinementTodayQuerySchema = z.object({
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sessionSlot: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .optional(),
})

export const guidedRefinementSessionHeaderBodySchema = z.object({
  focusSummary: z.string().max(16_000).nullable().optional(),
  candidateWorkItemPublicIds: z.array(z.string().uuid()).max(500).optional(),
  refinementMode: z.enum(["live", "async"]).optional(),
  facilitatorUserPublicId: z.string().uuid().nullable().optional(),
  productOwnerUserPublicId: z.string().uuid().nullable().optional(),
  sprintPublicId: z.string().uuid().nullable().optional(),
})

export const guidedRefinementReviewBodySchema = z.object({
  reviewStatus: z.enum(["not_started", "in_review", "reviewed"]),
  readyForPlanning: z.boolean(),
  readyWithObservations: z.boolean().optional(),
  observations: z.string().max(16_000).nullable().optional(),
  businessClarifications: z.string().max(16_000).nullable().optional(),
  technicalQuestions: z.string().max(16_000).nullable().optional(),
  dependenciesText: z.string().max(16_000).nullable().optional(),
  risksText: z.string().max(16_000).nullable().optional(),
  estimationStatus: z.enum(["not_applicable", "pending", "recorded", "deferred"]).optional(),
  sizeConcern: z.enum(["none", "large", "split_recommended"]).optional(),
  notReadyReasons: z.array(z.string().max(128)).max(50).optional(),
  followUpRequired: z.boolean().optional(),
})

export const guidedRefinementCloseBodySchema = z.object({
  generalSummary: z.string().max(32_000),
  agreements: z.array(z.string().max(4000)).max(200),
  followUps: z.array(z.string().max(4000)).max(200),
  openQuestions: z.array(z.string().max(4000)).max(200).optional(),
})

export const guidedRefinementAdditiveNoteBodySchema = z.object({
  note: z.string().min(1).max(16_000),
})

export const guidedRefinementRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const guidedRefinementWorkItemParamsSchema = guidedRefinementProjectParamsSchema.extend({
  workItemPublicId: z.string().uuid(),
})
