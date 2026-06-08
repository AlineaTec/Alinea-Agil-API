import { z } from "zod"
import { REGISTRATION_INTENT_STATUSES } from "../../registro-onboarding/domain/registration-status.js"

const statusValues = REGISTRATION_INTENT_STATUSES as readonly string[]

export const platformIdentityRegistrationIntentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z
    .string()
    .max(320)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  status: z
    .union([z.string(), z.undefined()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined))
    .refine((s) => s === undefined || statusValues.includes(s), {
      message: "Estado de intent no válido.",
    }),
})

/** Borrar por uno o más `intentPublicId`; máximo razonable para lotes desde admin. */
export const deleteIdentityRegistrationIntentsBodySchema = z.object({
  intentPublicIds: z.array(z.string().uuid()).min(1).max(500),
  /** Omitir seguridad ante intents ya provisionados en workspace (sólo usar si sabes el impacto). */
  forceIncludingProvisioned: z.boolean().optional(),
})

export const purgeUnprovisionedBodySchema = z.object({
  acknowledgement: z.literal("PURGE_UNPROVISIONED_REGISTRATION_INTENTS"),
})
