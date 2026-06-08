import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkTeamMembershipState } from "../domain/work-team.js"

export interface WorkTeamMembershipRepository {
  insert(state: WorkTeamMembershipState, session?: ClientSession): Promise<void>
  listActiveTeamPublicIdsForUserInWorkspace(
    workspacePublicId: string,
    userPublicId: string,
    session?: ClientSession,
  ): Promise<string[]>
  findActiveByTeamAndUser(
    teamPublicId: string,
    userPublicId: string,
    session?: ClientSession,
  ): Promise<WorkTeamMembershipState | null>
  listByTeam(
    teamPublicId: string,
    options: { activeOnly: boolean; workspacePublicId?: string },
    session?: ClientSession,
  ): Promise<WorkTeamMembershipState[]>
  softDeactivate(
    teamPublicId: string,
    userPublicId: string,
    leftAt: Date,
    session?: ClientSession,
  ): Promise<WorkTeamMembershipState | null>
}
