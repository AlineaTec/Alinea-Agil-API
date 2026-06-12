import { z } from "zod"
import { IMPEDIMENT_STATUSES } from "../domain/impediment.js"
import type { ImpedimentStatus } from "../domain/impediment.js"

const uuid = z.string().uuid()

export const impedimentMountParamsSchema = z.object({
  workspacePublicId: uuid,
  projectPublicId: uuid,
})

export const impedimentPathParamsSchema = impedimentMountParamsSchema.extend({
  impedimentPublicId: uuid,
})

export const impedimentWorkItemOptionsQuerySchema = z
  .object({
    q: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sprintPublicId: uuid.optional(),
    includeWorkItemPublicId: uuid.optional(),
  })
  .strict()

const severitySchema = z.enum(["low", "medium", "high", "critical"])
const activeStatusSchema = z.enum(["open", "in_review", "mitigating"])

export const createImpedimentBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(8000),
  severity: severitySchema,
  responsibleUserPublicId: uuid.nullable().optional(),
  relatedWorkItemPublicId: uuid.nullable().optional(),
  relatedSprintPublicId: uuid.nullable().optional(),
  detectedAt: z.string().datetime().optional(),
})

export const patchImpedimentBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(8000).optional(),
    severity: severitySchema.optional(),
    responsibleUserPublicId: uuid.nullable().optional(),
    relatedWorkItemPublicId: uuid.nullable().optional(),
    relatedSprintPublicId: uuid.nullable().optional(),
    detectedAt: z.string().datetime().optional(),
    status: activeStatusSchema.optional(),
  })
  .strict()

export const resolveImpedimentBodySchema = z
  .object({
    resolutionSummary: z.string().min(1).max(4000),
  })
  .strict()

export const dismissImpedimentBodySchema = z
  .object({
    dismissalReason: z.string().min(1).max(4000),
  })
  .strict()

export const reopenImpedimentBodySchema = z.object({}).strict()

export const listImpedimentsQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => {
      if (!s || s.trim() === "") return undefined
      return s.split(",").map((x) => x.trim()).filter(Boolean)
    }),
  severity: severitySchema.optional(),
  responsibleUserPublicId: uuid.optional(),
  relatedWorkItemPublicId: uuid.optional(),
  relatedSprintPublicId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const statusSet = new Set(IMPEDIMENT_STATUSES as readonly string[])

export function parseStatusFilter(raw: string[] | undefined): ImpedimentStatus | ImpedimentStatus[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const parsed = raw.filter((x) => statusSet.has(x)) as ImpedimentStatus[]
  if (parsed.length === 0) return undefined
  if (parsed.length === 1) return parsed[0]
  return parsed
}
