import { z } from "zod"
import { scrumBacklogItemPathParamsSchema } from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"

export const TIME_ENTRY_NOTE_MAX = 2000
export const TIME_ENTRY_MINUTES_MAX = 24 * 60

export const workItemTimeEntryPathParamsSchema = scrumBacklogItemPathParamsSchema.extend({
  timeEntryPublicId: z.string().uuid(),
})

const cursorSchema = z
  .string()
  .min(1)
  .optional()
  .transform((v) => v ?? undefined)

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/

export const workDateYmdStringSchema = z
  .string()
  .regex(ymdRegex, "workDate must be YYYY-MM-DD.")
  .refine(
    (s) => {
      const d = new Date(`${s}T00:00:00.000Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
    },
    { message: "workDate is not a valid calendar day." },
  )

export const minutesSpentFieldSchema = z
  .number()
  .int("minutesSpent must be a whole number of minutes.")
  .min(1, "minutesSpent must be at least 1.")
  .max(TIME_ENTRY_MINUTES_MAX, `minutesSpent must not exceed ${TIME_ENTRY_MINUTES_MAX} (24h).`)

const noteFieldSchema = z
  .string()
  .max(TIME_ENTRY_NOTE_MAX, `note must not exceed ${TIME_ENTRY_NOTE_MAX} characters.`)
  .optional()
  .nullable()

export const listTimeEntriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: cursorSchema,
  })
  .strict()

export const createTimeEntryBodySchema = z
  .object({
    minutesSpent: minutesSpentFieldSchema,
    workDate: workDateYmdStringSchema,
    note: noteFieldSchema,
  })
  .strict()

export const patchTimeEntryBodySchema = z
  .object({
    minutesSpent: minutesSpentFieldSchema.optional(),
    workDate: workDateYmdStringSchema.optional(),
    note: noteFieldSchema,
  })
  .strict()
  .refine((o) => o.minutesSpent !== undefined || o.workDate !== undefined || o.note !== undefined, {
    message: "At least one of minutesSpent, workDate, or note is required for PATCH.",
  })
