import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkspaceInvitationStatus } from "../domain/workspace-invitation-status.js"
import type { WorkspaceInvitationState } from "../domain/workspace-invitation.js"

export type WorkspaceInvitationPlatformAdminListFilter = {
  workspacePublicId?: string
  status?: WorkspaceInvitationStatus
  /** Coincidencia parcial sobre correo ya normalizado (búsqueda case-insensitive). */
  emailContains?: string
  createdFrom?: Date
  createdTo?: Date
  limit: number
  offset: number
}

export interface WorkspaceInvitationRepository {
  findByTokenHash(tokenHash: string, session?: ClientSession): Promise<WorkspaceInvitationState | null>
  findPendingByWorkspaceAndEmail(
    workspacePublicId: string,
    emailNormalized: string,
    session?: ClientSession,
  ): Promise<WorkspaceInvitationState | null>
  findByInvitationPublicId(
    invitationPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceInvitationState | null>
  insert(row: WorkspaceInvitationState, session?: ClientSession): Promise<void>
  replace(row: WorkspaceInvitationState, session?: ClientSession): Promise<void>
  listPendingForWorkspace(workspacePublicId: string): Promise<WorkspaceInvitationState[]>
  listForPlatformAdminQuery(
    filter: WorkspaceInvitationPlatformAdminListFilter,
  ): Promise<{ rows: WorkspaceInvitationState[]; total: number }>
}
