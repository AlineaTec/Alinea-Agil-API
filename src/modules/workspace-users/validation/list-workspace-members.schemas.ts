import { z } from "zod"
import {
  WORKSPACE_ADMINISTRATIVE_ROLES,
  WORKSPACE_METHODOLOGICAL_ROLES,
} from "../domain/workspace-member-roles.js"
import { WORKSPACE_MEMBER_STATUSES } from "../domain/workspace-member-status.js"

export const listWorkspaceMembersQuerySchema = z
  .object({
    q: z.string().max(200).optional(),
    status: z.enum(WORKSPACE_MEMBER_STATUSES).optional(),
    hasSeatAssigned: z.enum(["true", "false"]).optional(),
    roleCategory: z.enum(["administrative", "methodological"]).optional(),
    workspaceRoleAdministrative: z.enum(WORKSPACE_ADMINISTRATIVE_ROLES).optional(),
    workspaceRoleMethodological: z.enum(WORKSPACE_METHODOLOGICAL_ROLES).optional(),
    userPublicId: z.string().uuid().optional(),
    sort: z.enum(["name", "updated_desc", "updated_asc"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).max(100_000).optional(),
    statsOnly: z.enum(["true", "false"]).optional(),
  })
  .transform((d) => ({
    q: d.q?.trim() || undefined,
    status: d.status,
    hasSeatAssigned:
      d.hasSeatAssigned === "true" ? true : d.hasSeatAssigned === "false" ? false : undefined,
    roleCategory: d.roleCategory,
    workspaceRoleAdministrative: d.workspaceRoleAdministrative,
    workspaceRoleMethodological: d.workspaceRoleMethodological,
    userPublicId: d.userPublicId,
    sort: d.sort ?? "name",
    limit: d.limit,
    offset: d.offset ?? 0,
    statsOnly: d.statsOnly === "true",
  }))

export type ListWorkspaceMembersQuery = z.infer<typeof listWorkspaceMembersQuerySchema>
