export interface WorkTeamMembershipDocProps  {
  teamMembershipPublicId: string
  workspacePublicId: string
  teamPublicId: string
  userPublicId: string
  joinedAt: Date
  leftAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
