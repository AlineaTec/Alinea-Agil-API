import { z } from "zod"
import { WORK_TEAM_STATUSES } from "../domain/work-team.js"

const uuid = z.string().uuid("Must be a valid UUID")

export const workTeamsMountParamsSchema = z.object({
  workspacePublicId: z.string().min(1),
})

export const workTeamPathParamsSchema = z.object({
  workspacePublicId: z.string().min(1),
  teamPublicId: z.string().min(1),
})

export const workTeamProjectMountParamsSchema = z.object({
  workspacePublicId: z.string().min(1),
  projectPublicId: z.string().min(1),
})

const targetSizeSchema = z
  .number()
  .int("targetSize must be an integer")
  .min(1, "targetSize must be at least 1")
  .max(10_000, "targetSize is too large")

export const createWorkTeamBodySchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  teamLeadUserPublicId: uuid.optional().nullable(),
  targetSize: targetSizeSchema.optional().nullable(),
})

export const patchWorkTeamBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional().nullable(),
    status: z.enum(WORK_TEAM_STATUSES).optional(),
    teamLeadUserPublicId: uuid.nullable().optional(),
    targetSize: targetSizeSchema.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" })

export const listWorkTeamsQuerySchema = z.object({
  status: z.enum(WORK_TEAM_STATUSES).optional(),
  teamLeadUserPublicId: z.string().uuid().optional(),
  memberUserPublicId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
})

export const addWorkTeamMemberBodySchema = z.object({
  userPublicId: uuid,
})

export const removeWorkTeamMemberBodyWhenLeadSchema = z.discriminatedUnion("resolveLead", [
  z.object({ resolveLead: z.literal("clear") }),
  z.object({ resolveLead: z.literal("reassign"), newLeadUserPublicId: uuid }),
])

export const linkWorkTeamProjectBodySchema = z.object({
  projectPublicId: uuid,
})

export const listWorkTeamMembersQuerySchema = z
  .object({
    includeInactive: z.enum(["true", "false"]).optional(),
  })
  .transform((d) => ({
    includeInactive: d.includeInactive === "true",
  }))

export const listWorkTeamAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
})
