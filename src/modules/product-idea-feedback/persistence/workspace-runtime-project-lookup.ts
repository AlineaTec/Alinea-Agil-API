/**
 * Comprueba que un `projectPublicId` existe en el workspace (proyecto operativo materializado).
 */
export interface WorkspaceRuntimeProjectLookup {
  existsInWorkspace(workspacePublicId: string, projectPublicId: string): Promise<boolean>
}
