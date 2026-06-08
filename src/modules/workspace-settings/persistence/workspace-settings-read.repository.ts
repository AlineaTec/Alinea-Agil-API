import type { WorkspaceBasicSettingsReadModel } from "../domain/workspace-basic-settings.read-model.js"

export interface WorkspaceSettingsReadRepository {
  findBasicSettingsByWorkspacePublicId(
    workspacePublicId: string,
  ): Promise<WorkspaceBasicSettingsReadModel | null>
}

/** Lectura + mutaciones acotadas del documento `Workspace` para workspace-settings. */
export interface WorkspaceSettingsRepository extends WorkspaceSettingsReadRepository {
  updateDisplayNameByWorkspacePublicId(
    workspacePublicId: string,
    displayName: string,
  ): Promise<WorkspaceBasicSettingsReadModel | null>
}
