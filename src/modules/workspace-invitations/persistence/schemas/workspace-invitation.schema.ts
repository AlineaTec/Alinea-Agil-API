import { WORKSPACE_INVITATION_STATUSES } from "../../domain/workspace-invitation-status.js"

export interface WorkspaceInvitationDocProps {
  invitationPublicId: string
  workspacePublicId: string
  emailNormalized: string
  fullNameProposed: string
  workspaceRoleAdministrative: string | null
  workspaceRoleMethodological: string | null
  assignSeatProposal: boolean
  tokenHash: string
  status: (typeof WORKSPACE_INVITATION_STATUSES)[number]
  expiresAt: Date
  invitedByUserPublicId: string
  acceptedAt: Date | null
  revokedAt: Date | null
  supersededByInvitationPublicId: string | null
  emailCommsSentAt: Date | null
}
