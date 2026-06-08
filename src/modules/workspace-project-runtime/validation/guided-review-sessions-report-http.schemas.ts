import { z } from "zod"

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const guidedReviewSessionsReportQuerySchema = z
  .object({
    sprintPublicId: z.string().uuid().optional(),
    dateFrom: ymd.optional(),
    dateTo: ymd.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const hasSprint = v.sprintPublicId !== undefined && v.sprintPublicId.length > 0
    const hasRange = v.dateFrom !== undefined && v.dateTo !== undefined
    const partialRange = (v.dateFrom !== undefined) !== (v.dateTo !== undefined)
    if (hasSprint && (v.dateFrom !== undefined || v.dateTo !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use either sprintPublicId or date range, not both." })
    }
    if (!hasSprint && !hasRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide sprintPublicId or both dateFrom and dateTo (UTC calendar days).",
      })
    }
    if (partialRange) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dateFrom and dateTo must be provided together." })
    }
    if (hasRange && v.dateFrom && v.dateTo && v.dateFrom > v.dateTo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dateFrom must not be after dateTo." })
    }
  })
