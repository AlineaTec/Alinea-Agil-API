import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../domain/workspace-member-roles.js"
import type { WorkspaceMemberStatus } from "../domain/workspace-member-status.js"

export type ListWorkspaceMembersFilters = {
  q?: string
  status?: WorkspaceMemberStatus
  hasSeatAssigned?: boolean
  roleCategory?: "administrative" | "methodological"
  workspaceRoleAdministrative?: WorkspaceAdministrativeRole
  workspaceRoleMethodological?: WorkspaceMethodologicalRole
  userPublicId?: string
}

export type ListWorkspaceMembersSort = "name" | "updated_desc" | "updated_asc"

export type WorkspaceMembersListStats = {
  total: number
  pending: number
  active: number
  active_without_seat: number
  deactivated: number
}
