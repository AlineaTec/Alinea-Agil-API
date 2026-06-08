import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { WorkspaceRuntimeProjectLookup } from "./workspace-runtime-project-lookup.js"

export function createWorkspaceRuntimeProjectLookup(
  projectRuntime: ProjectRuntimeRepository,
): WorkspaceRuntimeProjectLookup {
  return {
    async existsInWorkspace(workspacePublicId, projectPublicId) {
      const row = await projectRuntime.findByWorkspaceAndProjectPublicId(
        workspacePublicId,
        projectPublicId,
      )
      return row != null
    },
  }
}
