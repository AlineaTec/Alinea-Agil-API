import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkTeamState, WorkTeamStatus } from "../domain/work-team.js"

export type ListWorkTeamsFilters = {
  status?: WorkTeamStatus
  teamLeadUserPublicId?: string
  memberUserPublicId?: string
  q?: string
}

export type Pagination = { limit: number; offset: number }

export interface WorkTeamRepository {
  insert(state: WorkTeamState, session?: ClientSession): Promise<void>
  findByTeamPublicId(
    workspacePublicId: string,
    teamPublicId: string,
    session?: ClientSession,
  ): Promise<WorkTeamState | null>
  findByWorkspaceAndNameNormalized(
    workspacePublicId: string,
    nameNormalized: string,
    session?: ClientSession,
  ): Promise<WorkTeamState | null>
  list(
    workspacePublicId: string,
    filters: ListWorkTeamsFilters,
    pagination: Pagination,
    session?: ClientSession,
  ): Promise<{ items: WorkTeamState[]; totalCount: number }>
  update(
    workspacePublicId: string,
    teamPublicId: string,
    patch: Partial<{
      name: string
      nameNormalized: string
      description: string | null
      status: WorkTeamStatus
      teamLeadUserPublicId: string | null
      targetSize: number | null
    }>,
    session?: ClientSession,
  ): Promise<WorkTeamState | null>
}
