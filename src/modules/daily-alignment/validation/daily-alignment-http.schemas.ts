import { z } from "zod"

export const dailyAlignmentProjectParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const dailyAlignmentTodayQuerySchema = z.object({
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sessionSlot: z.string().max(32).optional(),
})

export const dailyAlignmentMyUpdateBodySchema = z.object({
  yesterdaySummary: z.string().max(8000).default(""),
  todayPlan: z.string().max(8000).default(""),
  impediments: z.string().max(8000).default(""),
  confirmedFromSuggestion: z.boolean().optional().default(false),
  alignmentMode: z.enum(["live", "async"]).optional(),
})

export const dailyAlignmentCloseBodySchema = z.object({
  generalSummary: z.string().max(12000).default(""),
  agreements: z.array(z.string().max(2000)).max(50).default([]),
  escalatedImpediments: z.array(z.string().max(4000)).max(50).default([]),
  followUps: z.array(z.string().max(2000)).max(50).default([]),
})

export const dailyAlignmentRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const dailyAlignmentSessionPublicIdParamsSchema = dailyAlignmentProjectParamsSchema.extend({
  sessionPublicId: z.string().uuid(),
})

export const dailyAlignmentFacilitatorTranscriptBodySchema = z.object({
  facilitatorTranscript: z.string().max(50_000).default(""),
})
