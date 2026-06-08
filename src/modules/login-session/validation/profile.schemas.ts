import { z } from "zod"

/**
 * PATCH `/v1/auth/profile`.
 * - `fullName` opcional (cambio de nombre).
 * - `newPassword` solo con `currentPassword`; política de longitud en servicio (alineada a registro).
 */
export const patchAuthProfileBodySchema = z
  .object({
    fullName: z.string().min(1).max(200).optional(),
    currentPassword: z.string().min(1).max(512).optional(),
    newPassword: z.string().min(1).max(128).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasNew =
      val.newPassword !== undefined && String(val.newPassword).length > 0
    const hasCurrent =
      val.currentPassword !== undefined && String(val.currentPassword).length > 0
    if (hasNew && !hasCurrent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Se requiere currentPassword para cambiar la contraseña.",
        path: ["currentPassword"],
      })
    }
    if (hasCurrent && !hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si se envía currentPassword debe enviarse newPassword.",
        path: ["newPassword"],
      })
    }
    const hasName = val.fullName !== undefined
    if (!hasName && !hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Envía fullName y/o newPassword (con currentPassword).",
        path: [],
      })
    }
  })

export type PatchAuthProfileBody = z.infer<typeof patchAuthProfileBodySchema>
