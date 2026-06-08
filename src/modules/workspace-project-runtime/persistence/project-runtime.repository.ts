import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { WorkspaceRuntimeProjectState } from "../domain/workspace-runtime-project.js"

export type ProjectRuntimeRepository = {
  insert(state: WorkspaceRuntimeProjectState, session?: ClientSession): Promise<void>
  findByWorkspaceAndProjectPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState | null>
  findByWorkspaceAndSourceDraftPublicId(
    workspacePublicId: string,
    sourceDraftPublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState | null>
  listByWorkspacePublicId(
    workspacePublicId: string,
    session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState[]>
  updateProjectNameByWorkspaceAndSourceDraft(
    workspacePublicId: string,
    sourceDraftPublicId: string,
    projectName: string,
    session?: ClientSession,
  ): Promise<void>
}
