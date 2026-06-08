import type { WorkspaceMember } from "@prisma/client"
import type { WorkspaceMemberState } from "../../domain/workspace-member.js"
import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../../domain/workspace-member-roles.js"

export function workspaceMemberFromPrisma(
  row: WorkspaceMember & { workspace?: { public_id: string } },
): WorkspaceMemberState {
  return {
    membershipPublicId: row.public_id,
    workspacePublicId: row.workspace?.public_id ?? row.workspace_public_id,
    userPublicId: row.user_public_id,
    emailNormalized: row.email_normalized,
    fullName: row.full_name,
    status: row.status,
    hasSeatAssigned: row.has_seat_assigned,
    workspaceRoleAdministrative: row.workspace_role_administrative as WorkspaceAdministrativeRole | null,
    workspaceRoleMethodological: row.workspace_role_methodological as WorkspaceMethodologicalRole | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function workspaceMemberToPrismaCreate(state: WorkspaceMemberState, workspaceId: string) {
  return {
    public_id: state.membershipPublicId,
    workspace_id: workspaceId,
    workspace_public_id: state.workspacePublicId,
    user_public_id: state.userPublicId,
    email_normalized: state.emailNormalized,
    full_name: state.fullName,
    status: state.status,
    has_seat_assigned: state.hasSeatAssigned,
    workspace_role_administrative: state.workspaceRoleAdministrative,
    workspace_role_methodological: state.workspaceRoleMethodological,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}
