export type WorkspaceOwnerMembershipState = {
  membershipPublicId: string
  workspacePublicId: string
  userPublicId: string
  role: "owner"
  createdAt: Date
  updatedAt: Date
}

export type CreateWorkspaceOwnerMembershipInput = {
  membershipPublicId: string
  workspacePublicId: string
  userPublicId: string
  role: "owner"
}

/**
 * Vínculo de provisioning del owner (distinto de `workspace_members` operativo).
 */
export interface WorkspaceOwnerMembershipRepository {
  create(input: CreateWorkspaceOwnerMembershipInput): Promise<WorkspaceOwnerMembershipState>
  findByWorkspaceAndUser(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<WorkspaceOwnerMembershipState | null>
}
