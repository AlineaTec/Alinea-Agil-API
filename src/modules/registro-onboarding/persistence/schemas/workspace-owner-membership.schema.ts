export const WORKSPACE_OWNER_MEMBERSHIP_ROLES = ["owner"] as const
export type WorkspaceOwnerMembershipRole = (typeof WORKSPACE_OWNER_MEMBERSHIP_ROLES)[number]

export interface WorkspaceOwnerMembershipDocProps {
  membershipPublicId: string
  workspacePublicId: string
  userPublicId: string
  role: WorkspaceOwnerMembershipRole
}
