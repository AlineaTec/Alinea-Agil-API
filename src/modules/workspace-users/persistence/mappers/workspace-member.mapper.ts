import type { WorkspaceMemberState } from "../../domain/workspace-member.js"
import type { WorkspaceMemberDocProps } from "../schemas/workspace-member.schema.js"

export function docToState(doc: WorkspaceMemberDocProps): WorkspaceMemberState {
  return {
    membershipPublicId: doc.membershipPublicId,
    workspacePublicId: doc.workspacePublicId,
    userPublicId: doc.userPublicId,
    emailNormalized: doc.emailNormalized,
    fullName: doc.fullName,
    status: doc.status,
    hasSeatAssigned: doc.hasSeatAssigned,
    workspaceRoleAdministrative: doc.workspaceRoleAdministrative,
    workspaceRoleMethodological: doc.workspaceRoleMethodological,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function stateToDocProps(state: WorkspaceMemberState): WorkspaceMemberDocProps {
  return {
    membershipPublicId: state.membershipPublicId,
    workspacePublicId: state.workspacePublicId,
    userPublicId: state.userPublicId,
    emailNormalized: state.emailNormalized,
    fullName: state.fullName,
    status: state.status,
    hasSeatAssigned: state.hasSeatAssigned,
    workspaceRoleAdministrative: state.workspaceRoleAdministrative,
    workspaceRoleMethodological: state.workspaceRoleMethodological,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}
