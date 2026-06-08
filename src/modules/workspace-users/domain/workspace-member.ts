import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "./workspace-member-roles.js"
import type { WorkspaceMemberStatus } from "./workspace-member-status.js"

/**
 * Miembro del workspace (web cliente). Fuente de verdad de asiento para licencias:
 * `hasSeatAssigned` y transiciones alineadas a `WorkspaceLicenseService.adjustAssignedSeats`.
 */
export type WorkspaceMemberState = {
  membershipPublicId: string
  workspacePublicId: string
  userPublicId: string
  emailNormalized: string
  fullName: string
  status: WorkspaceMemberStatus
  hasSeatAssigned: boolean
  workspaceRoleAdministrative: WorkspaceAdministrativeRole | null
  workspaceRoleMethodological: WorkspaceMethodologicalRole | null
  createdAt: Date
  updatedAt: Date
}
