import type { WorkspaceInvitation } from "@prisma/client"
import type { WorkspaceInvitationState } from "../../domain/workspace-invitation.js"
import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../../../workspace-users/domain/workspace-member-roles.js"

export function workspaceInvitationFromPrisma(row: WorkspaceInvitation): WorkspaceInvitationState {
  return {
    invitationPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    emailNormalized: row.email_normalized,
    fullNameProposed: row.full_name_proposed,
    workspaceRoleAdministrative: row.workspace_role_administrative as WorkspaceAdministrativeRole | null,
    workspaceRoleMethodological: row.workspace_role_methodological as WorkspaceMethodologicalRole | null,
    assignSeatProposal: row.assign_seat_proposal,
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    invitedByUserPublicId: row.invited_by_user_public_id,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    supersededByInvitationPublicId: row.superseded_by_invitation_public_id,
    emailCommsSentAt: row.email_comms_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function workspaceInvitationToPrisma(state: WorkspaceInvitationState, workspaceId: string) {
  return {
    public_id: state.invitationPublicId,
    workspace_id: workspaceId,
    workspace_public_id: state.workspacePublicId,
    email_normalized: state.emailNormalized,
    full_name_proposed: state.fullNameProposed,
    workspace_role_administrative: state.workspaceRoleAdministrative,
    workspace_role_methodological: state.workspaceRoleMethodological,
    assign_seat_proposal: state.assignSeatProposal,
    token_hash: state.tokenHash,
    status: state.status,
    expires_at: state.expiresAt,
    invited_by_user_public_id: state.invitedByUserPublicId,
    accepted_at: state.acceptedAt,
    revoked_at: state.revokedAt,
    superseded_by_invitation_public_id: state.supersededByInvitationPublicId,
    email_comms_sent_at: state.emailCommsSentAt,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}
