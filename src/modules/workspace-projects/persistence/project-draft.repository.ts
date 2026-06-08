import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { ProjectDraftState } from "../domain/project-draft.js"

export type ProjectDraftRepository = {
  insert(state: ProjectDraftState, session?: ClientSession): Promise<void>
  replace(state: ProjectDraftState, session?: ClientSession): Promise<void>
  findByWorkspaceAndDraftPublicId(
    workspacePublicId: string,
    draftPublicId: string,
    session?: ClientSession,
  ): Promise<ProjectDraftState | null>
  listByWorkspacePublicId(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<ProjectDraftState[]>
  deleteByWorkspaceAndDraftPublicId(
    workspacePublicId: string,
    draftPublicId: string,
    session?: ClientSession,
  ): Promise<boolean>
}
