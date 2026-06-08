import { z } from "zod"
import {
  productFeedbackMisroutingCategories,
  productFeedbackReviewStatuses,
  productFeedbackSubmissionTypes,
} from "../domain/product-feedback-submission.js"

export const GENERAL_ENTRY_ROUTE = "general_entry" as const

export const MAX_BODY = 4000
export const MIN_BODY = 20
export const MAX_TITLE = 120
export const MAX_SCREEN_CONTEXT_SERIALIZED = 1000
export const MAX_OPERATIONAL_APPROACH = 2000

const submissionTypeZ = z.enum(productFeedbackSubmissionTypes)
const reviewStatusZ = z.enum(productFeedbackReviewStatuses)
const misroutingZ = z.enum(productFeedbackMisroutingCategories)

export const submitProductFeedbackBodySchema = z.object({
  workspacePublicId: z.string().uuid(),
  submissionType: submissionTypeZ,
  title: z.union([z.string(), z.null()]).optional(),
  body: z.string(),
  ideaPublicId: z.union([z.string().uuid(), z.null()]).optional(),
  moduleKey: z.union([z.string().max(128), z.null()]).optional(),
  route: z.string().min(1).max(512).optional(),
  screenContext: z.unknown().optional(),
  projectPublicId: z.union([z.string().uuid(), z.null()]).optional(),
  operationalApproach: z.union([z.string(), z.null()]).optional(),
  sourceSurface: z.string().min(1).max(128),
  reaction: z.union([z.string().max(64), z.null()]).optional(),
})

export const productFeedbackEligibilityQuerySchema = z.object({
  workspacePublicId: z.string().uuid(),
  ideaPublicId: z.string().uuid(),
})

export const submissionPublicIdParamsSchema = z.object({
  submissionPublicId: z.string().uuid(),
})

export const listProductFeedbackQuerySchema = z
  .object({
    submissionType: submissionTypeZ.optional(),
    status: reviewStatusZ.optional(),
    workspacePublicId: z.string().uuid().optional(),
    moduleKey: z.string().max(128).optional(),
    projectPublicId: z.string().uuid().optional(),
    ideaPublicId: z.string().uuid().optional(),
    misroutingCategory: misroutingZ.optional(),
    q: z.string().max(200).optional(),
    createdFrom: z
      .string()
      .optional()
      .refine((s) => s === undefined || !Number.isNaN(Date.parse(s)), { message: "Invalid createdFrom" })
      .transform((s) => (s ? new Date(s) : undefined)),
    createdTo: z
      .string()
      .optional()
      .refine((s) => s === undefined || !Number.isNaN(Date.parse(s)), { message: "Invalid createdTo" })
      .transform((s) => (s ? new Date(s) : undefined)),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict()

export const patchProductFeedbackBodySchema = z
  .object({
    status: reviewStatusZ.optional(),
    internalTags: z.array(z.string().max(64)).max(50).optional(),
    internalNotes: z.union([z.string().max(8000), z.null()]).optional(),
    misroutingCategory: z.union([misroutingZ, z.null()]).optional(),
    duplicateOfSubmissionPublicId: z.union([z.string().uuid(), z.null()]).optional(),
    ideaPublicId: z.union([z.string().uuid(), z.null()]).optional(),
    reviewDisposition: z.union([z.string().max(256), z.null()]).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "Nada que actualizar." })

export type SubmitProductFeedbackBody = z.infer<typeof submitProductFeedbackBodySchema>
export type PatchProductFeedbackBody = z.infer<typeof patchProductFeedbackBodySchema>
export type ListProductFeedbackQuery = z.infer<typeof listProductFeedbackQuerySchema>
