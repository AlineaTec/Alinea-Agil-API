import { z } from "zod"

export const sprintPlanningMountParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const sprintPlanningSprintParamsSchema = sprintPlanningMountParamsSchema.extend({
  sprintPublicId: z.string().uuid(),
})

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date as YYYY-MM-DD.")

export const createScrumSprintBodySchema = z.object({
  name: z.string().trim().min(1).max(500),
  goal: z.string().max(8000).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
})

export const patchScrumSprintBodySchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    goal: z.string().max(8000).optional(),
    startDate: dateOnlySchema.nullable().optional(),
    endDate: dateOnlySchema.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required." })

export const commitBacklogItemBodySchema = z.object({
  backlogItemPublicId: z.string().uuid(),
})

export const sprintPlanningItemParamsSchema = sprintPlanningSprintParamsSchema.extend({
  backlogItemPublicId: z.string().uuid(),
})

export const availableCommitItemsQuerySchema = z
  .object({
    q: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

export function parseDateOnlyToUtcNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`)
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}
