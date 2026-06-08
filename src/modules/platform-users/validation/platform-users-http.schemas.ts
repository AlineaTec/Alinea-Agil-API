import { z } from "zod"
import { normalizeEmailBasic } from "../../registro-onboarding/validation/email-normalization.js"
import { platformRoleSchema } from "../domain/platform-role.js"

/** Perfil propio autenticado: solo nombre visible. Cadena vacía → null. */
export const platformMePatchBodySchema = z.object({
  displayName: z
    .string()
    .max(200)
    .transform((s) => s.trim())
    .transform((s) => (s.length === 0 ? null : s)),
})

export const platformInviteBodySchema = z.object({
  email: z.string().email(),
  role: platformRoleSchema,
  displayName: z.string().max(200).optional().nullable(),
})

export const platformChangeRoleBodySchema = z.object({
  role: platformRoleSchema,
})

export const platformSetPasswordBodySchema = z.object({
  email: z.string().email(),
  invitationNonce: z.string().min(8),
  password: z.string().min(10),
})

export const platformLoginBodySchema = z.object({
  email: z
    .string()
    .transform((s) => normalizeEmailBasic(s))
    .pipe(z.string().email()),
  /** Sin espacios extremos (evita fallos silenciosos al pegar la clave). */
  password: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "La contraseña no puede estar vacía.")),
  totpCode: z
    .string()
    .optional()
    .transform((s) => (typeof s === "string" ? s.trim() : s)),
  turnstileToken: z.string().min(1).max(4096).optional(),
})

export const platformUserIdParamsSchema = z.object({
  platformUserId: z.string().uuid(),
})

export const platformMfaStartBodySchema = z.object({
  invitationNonce: z.string().optional(),
})

export const platformMfaCompleteBodySchema = z.object({
  invitationNonce: z.string().optional(),
  code: z.string().min(4),
})

export const platformPasswordResetRequestBodySchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((e) => normalizeEmailBasic(e)),
})

export const platformPasswordResetConfirmBodySchema = z.object({
  token: z.string().trim().min(20).max(512),
  newPassword: z.string().min(10).max(128),
})
