import { z } from "zod"

export const operatingSnapshotProjectParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const operatingSnapshotQuerySchema = z.object({
  forceRefresh: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  includeCalendarExtract: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? true : v === "true")),
})

export const operatingSnapshotNbaSnoozeBodySchema = z.object({
  snoozeKey: z.string().min(1).max(200),
  snoozedUntilOperationalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
