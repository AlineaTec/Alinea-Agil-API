import { z } from "zod"

export const billingWorkspacePublicIdParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

const commercialPlanSchema = z.enum(["individual", "team"])
const billingCadenceSchema = z.literal("monthly").default("monthly")

export const billingCheckoutSessionBodySchema = z
  .object({
    plan: commercialPlanSchema,
    billingCadence: billingCadenceSchema,
    /** Obligatorio si `plan === team`; ignorado en Individual salvo validación de 1. */
    desiredSeats: z.coerce.number().int().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.plan === "team" && v.desiredSeats == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "desiredSeats es obligatorio para plan team",
        path: ["desiredSeats"],
      })
    }
  })

export const billingSeatChangeBodySchema = z.object({
  desiredSeats: z.coerce.number().int().min(1),
})
