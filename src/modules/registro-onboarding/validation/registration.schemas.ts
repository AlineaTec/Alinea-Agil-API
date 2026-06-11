import { z } from "zod"
import { VERIFICATION_CODE_LENGTH } from "../domain/verification-challenge.policy.js"
import { SIMULATED_PAYMENT_OUTCOMES } from "../domain/payment-simulation.policy.js"
import { normalizeWorkspaceModality } from "../domain/workspace-modality.js"
import { normalizeEmailBasic } from "./email-normalization.js"
import { COMMERCIAL_PLAN_TIERS } from "../../commercial-pricing/commercial-pricing.constants.js"

const monthlyBillingCadenceSchema = z.literal("monthly")

const commercialPlanTierSchema = z.enum(COMMERCIAL_PLAN_TIERS)

/**
 * Body POST /email-eligibility.
 * Normalización alineada a `email-normalization.ts` (+ reglas **[P]** en contracts-docs).
 */
export const emailEligibilityBodySchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, { message: "email_too_long" })
    .email({ message: "invalid_email_format" })
    .transform((e) => normalizeEmailBasic(e)),
  turnstileToken: z.string().min(1).max(4096).optional(),
})

export type EmailEligibilityBody = z.infer<typeof emailEligibilityBodySchema>

/** POST /verification/request — OP-B1 / reemisión preparada (supersede). */
export const verificationRequestBodySchema = z.object({
  intentPublicId: z.string().uuid(),
})

export type VerificationRequestBody = z.infer<typeof verificationRequestBodySchema>

const otpRegex = new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`)

/** POST /verification/confirm — OP-B3. */
export const verificationConfirmBodySchema = z.object({
  intentPublicId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(otpRegex, { message: "invalid_code_format" }),
})

export type VerificationConfirmBody = z.infer<typeof verificationConfirmBodySchema>

/** POST /modality — plan Gratis / Equipo / Pro (tier) o legado Individual / Team. */
export const setModalityBodySchema = z
  .object({
    intentPublicId: z.string().uuid(),
    modality: z.enum(["individual", "team", "empresa"]).optional(),
    planTier: commercialPlanTierSchema.optional(),
    billingCadence: monthlyBillingCadenceSchema.optional().default("monthly"),
    teamSeatsPurchased: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.planTier === undefined && val.modality === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plan_tier_or_modality_required",
        path: ["planTier"],
      })
      return
    }
    if (val.modality !== undefined && normalizeWorkspaceModality(val.modality) === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalid_modality",
        path: ["modality"],
      })
    }
    if (
      (val.planTier === "estandar" || val.planTier === "profesional") &&
      val.modality !== undefined &&
      normalizeWorkspaceModality(val.modality) === "individual"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plan_tier_modality_mismatch",
        path: ["modality"],
      })
    }
  })

export type SetModalityBody = z.infer<typeof setModalityBodySchema>

/** POST /commercial-quote — vista previa sin intento (misma lógica que `commercial-pricing`). */
export const commercialQuoteBodySchema = z
  .object({
    modality: z.enum(["individual", "team", "empresa"]).optional(),
    planTier: commercialPlanTierSchema.optional(),
    billingCadence: monthlyBillingCadenceSchema.default("monthly"),
    teamSeatsPurchased: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.planTier === undefined && val.modality === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plan_tier_or_modality_required",
        path: ["planTier"],
      })
      return
    }
    if (val.modality !== undefined && normalizeWorkspaceModality(val.modality) === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalid_modality",
        path: ["modality"],
      })
    }
  })

export type CommercialQuoteBody = z.infer<typeof commercialQuoteBodySchema>

/** POST /paddle-checkout-lines — misma forma que commercial-quote. */
export const paddleCheckoutLinesBodySchema = commercialQuoteBodySchema

export type PaddleCheckoutLinesBody = z.infer<typeof paddleCheckoutLinesBodySchema>

/** POST /workspace-code-availability — OP-D1 pre-check. */
export const workspaceCodeAvailabilityBodySchema = z.object({
  code: z.string().min(1).max(80),
  intentPublicId: z.string().uuid().optional(),
})

export type WorkspaceCodeAvailabilityBody = z.infer<
  typeof workspaceCodeAvailabilityBodySchema
>

/** POST /workspace-identity — persistir nombre + código en el intento (OP-D1 + persistencia). */
export const workspaceIdentityBodySchema = z.object({
  intentPublicId: z.string().uuid(),
  workspaceName: z.string().trim().min(1).max(120),
  workspaceCode: z.string().trim().min(1).max(80),
})

export type WorkspaceIdentityBody = z.infer<typeof workspaceIdentityBodySchema>

/** POST /account-credentials — Fase E (OP-E1); sin confirmación de contraseña en servidor (solo cliente). */
export const setAccountCredentialsBodySchema = z.object({
  intentPublicId: z.string().uuid(),
  fullName: z.string().max(220),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().min(1).max(4096).optional(),
})

export type SetAccountCredentialsBody = z.infer<
  typeof setAccountCredentialsBodySchema
>

/** POST /payment/simulated-confirm — Fase F (sin datos de tarjeta). */
export const confirmSimulatedPaymentBodySchema = z.object({
  intentPublicId: z.string().uuid(),
  simulatedOutcome: z.enum(SIMULATED_PAYMENT_OUTCOMES).optional(),
})

export type ConfirmSimulatedPaymentBody = z.infer<
  typeof confirmSimulatedPaymentBodySchema
>

/** POST /payment/paddle-complete — Fase F (Paddle Billing, TX verificada contra Paddle API). */
export const confirmPaddlePaymentBodySchema = z.object({
  intentPublicId: z.string().uuid(),
  paddleTransactionId: z.string().min(4).max(120),
})

export type ConfirmPaddlePaymentBody = z.infer<
  typeof confirmPaddlePaymentBodySchema
>

/** POST /payment/free-confirm — marca pago exitoso para plan Gratis ($0). */
export const confirmFreePlanPaymentBodySchema = z.object({
  intentPublicId: z.string().uuid(),
})

export type ConfirmFreePlanPaymentBody = z.infer<
  typeof confirmFreePlanPaymentBodySchema
>

/** POST /activate — provisioning tras pago exitoso (OP-ACTIVATE-1). */
export const activateRegistrationBodySchema = z.object({
  intentPublicId: z.string().uuid(),
  turnstileToken: z.string().min(1).max(4096).optional(),
})

export type ActivateRegistrationBody = z.infer<
  typeof activateRegistrationBodySchema
>
