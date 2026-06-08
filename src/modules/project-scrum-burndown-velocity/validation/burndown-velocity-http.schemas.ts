import { z } from "zod"

const uuidish = z.string().uuid("invalid_uuid")

export const projectParamsSchema = z.object({
  workspacePublicId: uuidish,
  projectPublicId: uuidish,
})

export const burndownSprintParamsSchema = z.object({
  workspacePublicId: uuidish,
  projectPublicId: uuidish,
  sprintPublicId: uuidish,
})

/** Default: true. `includeIdealLine=false` desactiva cálculo de eje ideal (p. ex. A/B test interno). */
export function includeIdealLineFromQuery(query: unknown): boolean {
  const raw = (query as { includeIdealLine?: unknown } | null)?.includeIdealLine
  if (raw === undefined) return true
  if (Array.isArray(raw)) return includeIdealLineFromQuery({ includeIdealLine: raw[0] })
  const s = String(raw).trim().toLowerCase()
  if (s === "" || s === "1" || s === "true" || s === "yes" || s === "on") return true
  if (s === "0" || s === "false" || s === "no" || s === "off") return false
  return true
}

export const velocityQuerySchema = z.object({
  lastN: z
    .string()
    .optional()
    .transform((s) => (s && s.length > 0 ? parseInt(s, 10) : 6))
    .refine(
      (n) => !Number.isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 12,
      "lastN must be an integer 1..12",
    ),
})

export type ProjectParams = z.infer<typeof projectParamsSchema>
export type BurndownSprintParams = z.infer<typeof burndownSprintParamsSchema>
