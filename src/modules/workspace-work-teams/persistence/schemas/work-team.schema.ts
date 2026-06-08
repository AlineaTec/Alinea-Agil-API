import { WORK_TEAM_STATUSES } from "../../domain/work-team.js"

export interface WorkTeamDocProps  {
  teamPublicId: string
  workspacePublicId: string
  name: string
  nameNormalized: string
  description: string | null
  status: (typeof WORK_TEAM_STATUSES)[number]
  teamLeadUserPublicId: string | null
  targetSize: number | null
  createdAt: Date
  updatedAt: Date
}
