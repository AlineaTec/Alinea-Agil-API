import { z } from "zod"

export const workspaceLicensePathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const increaseSeatsBodySchema = z.object({
  increment: z.number().int().positive(),
})

export const scheduleSeatReductionBodySchema = z.object({
  targetPurchasedAfterRenewal: z.number().int().min(0),
})
