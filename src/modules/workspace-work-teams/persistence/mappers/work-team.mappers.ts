import type { WorkTeamMembershipState, WorkTeamProjectLinkState, WorkTeamState } from "../../domain/work-team.js"
import type { WorkTeamDocProps } from "../schemas/work-team.schema.js"
import type { WorkTeamMembershipDocProps } from "../schemas/work-team-membership.schema.js"
import type { WorkTeamProjectLinkDocProps } from "../schemas/work-team-project-link.schema.js"
import { WORK_TEAM_STATUSES, type WorkTeamStatus } from "../../domain/work-team.js"

function toWorkTeamStatus(value: string): WorkTeamStatus {
  if (!WORK_TEAM_STATUSES.includes(value as WorkTeamStatus)) {
    throw new TypeError(`Invalid work team status: ${String(value)}`)
  }
  return value as WorkTeamStatus
}

export function toWorkTeamState(doc: WorkTeamDocProps | null | undefined): WorkTeamState {
  if (!doc) {
    throw new TypeError("Expected work team document.")
  }
  const status = toWorkTeamStatus(doc.status)
  return {
    teamPublicId: doc.teamPublicId,
    workspacePublicId: doc.workspacePublicId,
    name: doc.name,
    nameNormalized: doc.nameNormalized,
    description: doc.description,
    status,
    teamLeadUserPublicId: doc.teamLeadUserPublicId,
    targetSize: doc.targetSize,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function toWorkTeamMembershipState(doc: WorkTeamMembershipDocProps | null | undefined): WorkTeamMembershipState {
  if (!doc) {
    throw new TypeError("Expected work team membership document.")
  }
  return {
    teamMembershipPublicId: doc.teamMembershipPublicId,
    workspacePublicId: doc.workspacePublicId,
    teamPublicId: doc.teamPublicId,
    userPublicId: doc.userPublicId,
    joinedAt: doc.joinedAt,
    leftAt: doc.leftAt,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function toWorkTeamProjectLinkState(doc: WorkTeamProjectLinkDocProps | null | undefined): WorkTeamProjectLinkState {
  if (!doc) {
    throw new TypeError("Expected work team project link document.")
  }
  return {
    teamProjectLinkPublicId: doc.teamProjectLinkPublicId,
    workspacePublicId: doc.workspacePublicId,
    teamPublicId: doc.teamPublicId,
    projectPublicId: doc.projectPublicId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
