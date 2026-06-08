import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../../domain/workspace-member-roles.js"
import { WORKSPACE_MEMBER_STATUSES } from "../../domain/workspace-member-status.js"

export interface WorkspaceMemberDocProps {
  membershipPublicId: string
  workspacePublicId: string
  userPublicId: string
  emailNormalized: string
  fullName: string
  status: (typeof WORKSPACE_MEMBER_STATUSES)[number]
  hasSeatAssigned: boolean
  workspaceRoleAdministrative: WorkspaceAdministrativeRole | null
  workspaceRoleMethodological: WorkspaceMethodologicalRole | null
  createdAt: Date
  updatedAt: Date
}
