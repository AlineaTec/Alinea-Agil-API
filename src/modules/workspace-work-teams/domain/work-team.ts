/** Estados v1 — contracts-docs workspace-work-teams */
export const WORK_TEAM_STATUSES = ["active", "inactive", "archived"] as const
export type WorkTeamStatus = (typeof WORK_TEAM_STATUSES)[number]

export type WorkTeamState = {
  teamPublicId: string
  workspacePublicId: string
  name: string
  nameNormalized: string
  description: string | null
  status: WorkTeamStatus
  teamLeadUserPublicId: string | null
  targetSize: number | null
  createdAt: Date
  updatedAt: Date
}

export type WorkTeamMembershipState = {
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

export type WorkTeamProjectLinkState = {
  teamProjectLinkPublicId: string
  workspacePublicId: string
  teamPublicId: string
  projectPublicId: string
  createdAt: Date
  updatedAt: Date
}
