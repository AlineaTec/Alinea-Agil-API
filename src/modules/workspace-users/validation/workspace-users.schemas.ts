import { z } from "zod"
import {
  WORKSPACE_ADMINISTRATIVE_ROLES,
  WORKSPACE_METHODOLOGICAL_ROLES,
} from "../domain/workspace-member-roles.js"

const administrativeRoleSchema = z.enum(WORKSPACE_ADMINISTRATIVE_ROLES)
const methodologicalRoleSchema = z.enum(WORKSPACE_METHODOLOGICAL_ROLES)

export const workspaceUsersPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const workspaceMemberPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  membershipPublicId: z.string().uuid(),
})

export const createWorkspaceMemberBodySchema = z
  .object({
    userPublicId: z.string().uuid().optional(),
    email: z.string().min(3),
    fullName: z.string().min(1),
    workspaceRoleAdministrative: administrativeRoleSchema.optional(),
    workspaceRoleMethodological: methodologicalRoleSchema.optional(),
    assignSeat: z.boolean().optional(),
  })
  .refine(
    (d) =>
      (d.workspaceRoleAdministrative !== undefined) !==
      (d.workspaceRoleMethodological !== undefined),
    {
      message: "Exactly one of workspaceRoleAdministrative or workspaceRoleMethodological must be provided.",
    },
  )

export const workspaceInvitationPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  invitationPublicId: z.string().uuid(),
})

export const publicWorkspaceInvitationTokenParamsSchema = z.object({
  token: z.string().min(16).max(512),
})

export const updateWorkspaceMemberRolesBodySchema = z
  .object({
    workspaceRoleAdministrative: administrativeRoleSchema.optional(),
    workspaceRoleMethodological: methodologicalRoleSchema.optional(),
  })
  .refine(
    (d) =>
      (d.workspaceRoleAdministrative !== undefined) !==
      (d.workspaceRoleMethodological !== undefined),
    {
      message: "Exactly one of workspaceRoleAdministrative or workspaceRoleMethodological must be provided.",
    },
  )
