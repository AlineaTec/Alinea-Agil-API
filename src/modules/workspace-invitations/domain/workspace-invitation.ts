import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../../workspace-users/domain/workspace-member-roles.js"
import type { WorkspaceInvitationStatus } from "./workspace-invitation-status.js"

export type WorkspaceInvitationState = {
  invitationPublicId: string
  workspacePublicId: string
  emailNormalized: string
  /** Nombre propuesto por quien invita (el invitado puede completar en registro). */
  fullNameProposed: string
  workspaceRoleAdministrative: WorkspaceAdministrativeRole | null
  workspaceRoleMethodological: WorkspaceMethodologicalRole | null
  assignSeatProposal: boolean
  tokenHash: string
  status: WorkspaceInvitationStatus
  expiresAt: Date
  invitedByUserPublicId: string
  acceptedAt: Date | null
  revokedAt: Date | null
  supersededByInvitationPublicId: string | null
  emailCommsSentAt: Date | null
  createdAt: Date
  updatedAt: Date
}
