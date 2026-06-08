import type { WorkTeam, WorkTeamMembership, WorkTeamProjectLink } from "@prisma/client"
import type {
  WorkTeamMembershipState,
  WorkTeamProjectLinkState,
  WorkTeamState,
} from "../../domain/work-team.js"
import { WORK_TEAM_STATUSES, type WorkTeamStatus } from "../../domain/work-team.js"

function toWorkTeamStatus(value: string): WorkTeamStatus {
  if (!WORK_TEAM_STATUSES.includes(value as WorkTeamStatus)) {
    throw new TypeError(`Invalid work team status: ${value}`)
  }
  return value as WorkTeamStatus
}

export function workTeamFromPrisma(row: WorkTeam): WorkTeamState {
  return {
    teamPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    name: row.name,
    nameNormalized: row.name_normalized,
    description: row.description,
    status: toWorkTeamStatus(row.status),
    teamLeadUserPublicId: row.team_lead_user_public_id,
    targetSize: row.target_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function workTeamMembershipFromPrisma(row: WorkTeamMembership): WorkTeamMembershipState {
  return {
    teamMembershipPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    teamPublicId: row.team_public_id,
    userPublicId: row.user_public_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function workTeamProjectLinkFromPrisma(row: WorkTeamProjectLink): WorkTeamProjectLinkState {
  return {
    teamProjectLinkPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    teamPublicId: row.team_public_id,
    projectPublicId: row.project_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
