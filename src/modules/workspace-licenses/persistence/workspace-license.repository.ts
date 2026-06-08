import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkspaceLicenseState } from "../domain/workspace-license-state.js"

export interface WorkspaceLicenseRepository {
  findByWorkspacePublicId(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceLicenseState | null>
  /** Lectura masiva (reportes / billing admin). */
  findManyByWorkspacePublicIds(
    workspacePublicIds: string[],
    session?: ClientSession,
  ): Promise<Map<string, WorkspaceLicenseState>>
  insertInitial(state: WorkspaceLicenseState, session?: ClientSession): Promise<void>
  replace(state: WorkspaceLicenseState, session?: ClientSession): Promise<void>
}
