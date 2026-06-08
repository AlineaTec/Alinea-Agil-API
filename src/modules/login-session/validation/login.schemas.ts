import { z } from "zod"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"

/** Body tentativo para OP-L1; reutiliza normalización alineada al registro. */
export const loginEmailPasswordBodySchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((e) => normalizeEmailBasic(e)),
  password: z.string().min(1).max(512),
  /** Token del widget Cloudflare Turnstile (obligatorio si el API tiene `TURNSTILE_SECRET_KEY`). */
  turnstileToken: z.string().min(1).max(4096).optional(),
})

export type LoginEmailPasswordBody = z.infer<typeof loginEmailPasswordBodySchema>

/** Body para solicitud de enlace de restablecimiento (cuando el flujo esté implementado). */
export const passwordResetRequestBodySchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((e) => normalizeEmailBasic(e)),
})

export type PasswordResetRequestBody = z.infer<typeof passwordResetRequestBodySchema>

export const passwordResetConfirmBodySchema = z.object({
  token: z.string().trim().min(20).max(512),
  newPassword: z.string().min(8).max(128),
})

export const postAuthActiveWorkspaceBodySchema = z.object({
  workspacePublicId: z.string().uuid(),
})
