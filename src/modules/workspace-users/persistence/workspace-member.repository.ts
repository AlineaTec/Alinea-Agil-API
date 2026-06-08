import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkspaceMemberState } from "../domain/workspace-member.js"
import type {
  ListWorkspaceMembersFilters,
  ListWorkspaceMembersSort,
  WorkspaceMembersListStats,
} from "./list-workspace-members.types.js"

export interface WorkspaceMemberRepository {
  findByMembershipPublicId(
    membershipPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceMemberState | null>
  findByWorkspaceAndEmail(
    workspacePublicId: string,
    emailNormalized: string,
    session?: ClientSession,
  ): Promise<WorkspaceMemberState | null>
  findByWorkspaceAndUserPublicId(
    workspacePublicId: string,
    userPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceMemberState | null>
  listByWorkspacePublicId(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceMemberState[]>
  listByWorkspaceFiltered(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    options: { sort: ListWorkspaceMembersSort; limit: number; offset: number },
    session?: ClientSession,
  ): Promise<{ items: WorkspaceMemberState[]; totalCount: number }>
  countByWorkspaceFiltered(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    session?: ClientSession,
  ): Promise<number>
  aggregateStatusStatsByWorkspace(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    session?: ClientSession,
  ): Promise<WorkspaceMembersListStats>
  /**
   * Todas las membresías del usuario (posiblemente >1 si existen datos históricos o evolución multi-workspace).
   * Orden: `updatedAt` descendente (la primera entrada es la elegida hoy para `/auth/me`).
   */
  listByUserPublicId(
    userPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceMemberState[]>
  /** Otros miembros con rol administrativo `admin`, excluyendo `excludeMembershipPublicId` si se indica. */
  countOtherActiveAdministrativeAdmins(
    workspacePublicId: string,
    excludeMembershipPublicId: string | null,
    session?: ClientSession,
  ): Promise<number>
  /**
   * Usuarios que consumen cupo de asiento (**v1 billing-seat-enforcement**):
   * membresías `active` con `hasSeatAssigned === true`.
   */
  countActiveSeatConsumingMembers(workspacePublicId: string, session?: ClientSession): Promise<number>
  insert(state: WorkspaceMemberState, session?: ClientSession): Promise<void>
  replace(state: WorkspaceMemberState, session?: ClientSession): Promise<void>
  deleteByMembershipPublicId(membershipPublicId: string, session?: ClientSession): Promise<void>
}
