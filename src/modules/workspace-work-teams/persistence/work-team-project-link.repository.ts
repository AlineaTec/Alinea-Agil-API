import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkTeamProjectLinkState } from "../domain/work-team.js"

export interface WorkTeamProjectLinkRepository {
  insert(state: WorkTeamProjectLinkState, session?: ClientSession): Promise<void>
  listDistinctProjectPublicIdsForTeams(
    workspacePublicId: string,
    teamPublicIds: string[],
    session?: ClientSession,
  ): Promise<string[]>
  deleteByTeamAndProject(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
    session?: ClientSession,
  ): Promise<boolean>
  listByTeam(
    workspacePublicId: string,
    teamPublicId: string,
    session?: ClientSession,
  ): Promise<WorkTeamProjectLinkState[]>
  listByProject(
    workspacePublicId: string,
    projectPublicId: string,
    session?: ClientSession,
  ): Promise<WorkTeamProjectLinkState[]>
  findByTeamAndProject(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
    session?: ClientSession,
  ): Promise<WorkTeamProjectLinkState | null>
}
