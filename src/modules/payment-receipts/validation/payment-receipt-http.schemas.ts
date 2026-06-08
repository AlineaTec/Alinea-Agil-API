import { z } from "zod"

const cursorSchema = z.string().min(1).optional()

export const workspacePaymentReceiptListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export type WorkspacePaymentReceiptListQuery = z.infer<typeof workspacePaymentReceiptListQuerySchema>

export const platformPaymentReceiptListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema,
  workspacePublicId: z.string().uuid().optional(),
  billingSource: z.enum(["all", "paddle", "manual"]).default("all"),
  paymentProvider: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export type PlatformPaymentReceiptListQuery = z.infer<typeof platformPaymentReceiptListQuerySchema>

export const paymentReceiptPublicIdParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  receiptPublicId: z.string().uuid(),
})

export const platformReceiptPublicIdParamsSchema = z.object({
  receiptPublicId: z.string().uuid(),
})
