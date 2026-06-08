import { z } from "zod"
import {
  productIdeaReactions,
  productIdeaFeedbackReviewStatuses,
  productIdeaSourceSurfaces,
} from "../domain/product-idea-feedback-entry.js"

const workspaceIdeaParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
    ideaPublicId: z.string().uuid(),
  })
  .strict()

/** Sin `.strict()`: en rutas bajo `/:ideaPublicId` sigue presente `ideaPublicId` en `req.params`. */
export const productIdeaWorkspaceOnlyPathParamsSchema = z.object({ workspacePublicId: z.string().uuid() })

export const productIdeaFeedbackWorkspacePathParamsSchema = workspaceIdeaParamsSchema

export const submitProductIdeaFeedbackEntryBodySchema = z
  .object({
    reaction: z.enum(productIdeaReactions),
    likedWhat: z.string().max(2000).optional().default(""),
    couldImproveWhat: z.string().max(2000).optional().default(""),
    additionalComment: z.string().max(4000).optional().nullable(),
    sourceSurface: z.enum(productIdeaSourceSurfaces).optional().default("other"),
    projectPublicId: z.string().min(1).max(320).optional().nullable(),
  })
  .strict()

export const listProductIdeaFeedbackEntryQuerySchema = z
  .object({
    reviewStatus: z.enum(productIdeaFeedbackReviewStatuses).optional(),
    ideaPublicId: z.string().uuid().optional(),
    workspacePublicId: z.string().uuid().optional(),
    from: z
      .string()
      .optional()
      .refine((s) => s === undefined || !Number.isNaN(Date.parse(s)), { message: "Invalid from date" })
      .transform((s) => (s ? new Date(s) : undefined)),
    to: z
      .string()
      .optional()
      .refine((s) => s === undefined || !Number.isNaN(Date.parse(s)), { message: "Invalid to date" })
      .transform((s) => (s ? new Date(s) : undefined)),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict()

export const feedbackPublicIdParamsSchema = z
  .object({ feedbackPublicId: z.string().uuid() })
  .strict()

export const patchProductIdeaFeedbackEntryBodySchema = z
  .object({
    reviewStatus: z.enum(productIdeaFeedbackReviewStatuses).optional(),
    internalTags: z.array(z.string().min(1).max(64)).max(32).optional(),
    internalNotes: z.string().max(8000).optional().nullable(),
  })
  .strict()

export const listProductIdeasQuerySchema = z
  .object({
    status: z.enum(["draft", "published", "archived", "internal"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict()

export const productIdeaIdParamsSchema = z.object({ ideaPublicId: z.string().uuid() }).strict()

export const createProductIdeaBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(2000),
    description: z.union([z.string().max(8000), z.null()]).optional(),
    area: z.string().min(1).max(64),
    status: z.enum(["draft", "published", "archived", "internal"]),
    isFeedbackEnabled: z.boolean(),
  })
  .strict()

export const patchProductIdeaBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    summary: z.string().min(1).max(2000).optional(),
    description: z.union([z.string().max(8000), z.null()]).optional(),
    area: z.string().min(1).max(64).optional(),
    status: z.enum(["draft", "published", "archived", "internal"]).optional(),
    isFeedbackEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "Se requiere al menos un campo para actualizar." })
