import { z } from "zod"

const uuid = z.string().uuid()

export const kanbanWipPathParamsSchema = z.object({
  workspacePublicId: uuid,
  projectPublicId: uuid,
})

const enforcement = z.enum(["informational", "warning", "blocking"])

export const kanbanWipPatchBodySchema = z
  .object({
    /** Umbral (0,1] para estado `near` en el proyecto. */
    wip_near_threshold_ratio: z.number().min(0.0001).max(1).optional(),
    /** Actualización parcial por columna. */
    columns: z
      .array(
        z.object({
          column_public_id: uuid,
          limit: z.number().int().min(1).nullable().optional(),
          policy: enforcement.optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (v) => v.wip_near_threshold_ratio !== undefined || (v.columns !== undefined && v.columns.length > 0),
    { message: "At least one of wip_near_threshold_ratio or non-empty columns is required." },
  )
